import { BleManager, State, type Device } from "react-native-ble-plx";
import { PermissionsAndroid, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Guarda o id do último dispositivo BLE que imprimiu com sucesso, pra pular o
// scan (que demora alguns segundos) nas próximas impressões.
const LAST_PRINTER_KEY = "cd_last_printer_id";
const SCAN_TIMEOUT_MS = 10000;
const CONNECT_TIMEOUT_MS = 5000;
const CHUNK_DELAY_MS = 20;
// MTU padrão do BLE é só 23 bytes (20 de payload) — sem negociar um valor
// maior, uma escrita maior que isso é truncada em silêncio pelo Android (sem
// erro nenhum), e é exatamente por isso que a impressora não recebia quase
// nada do conteúdo mesmo com o "sucesso" voltando pro app.
const MTU_REQUEST = 247;

/**
 * Impressoras POS58 clonadas não anunciam o UUID de serviço no pacote de
 * broadcast BLE (só revelam os serviços depois de conectar), então filtrar o
 * scan por UUID nunca encontra o aparelho. O nome anunciado, esse sim
 * aparece — é por ele que reconhecemos a impressora (modelo em uso: OIA-8388).
 */
const PRINTER_NAME_HINTS = ["OIA"];

function matchesPrinterName(name: string | null): boolean {
  if (!name) return false;
  const upper = name.toUpperCase();
  return PRINTER_NAME_HINTS.some((hint) => upper.includes(hint));
}

let manager: BleManager | null = null;

function getManager(): BleManager {
  if (!manager) manager = new BleManager();
  return manager;
}

async function ensurePermissions(): Promise<void> {
  if (Platform.OS !== "android") return;

  // Android 12+ (API 31) trocou a localização por permissões de Bluetooth
  // dedicadas; abaixo disso o scan BLE só libera com localização concedida.
  if (Platform.Version < 31) {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error("Permissão de localização negada (necessária pro Bluetooth no Android).");
    }
    return;
  }

  const results = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
  ]);
  const denied = Object.values(results).some(
    (result) => result !== PermissionsAndroid.RESULTS.GRANTED,
  );
  if (denied) throw new Error("Permissão de Bluetooth negada.");
}

interface WritableCharacteristic {
  serviceUUID: string;
  characteristicUUID: string;
  withoutResponse: boolean;
}

/**
 * Todo aparelho BLE expõe esses serviços padrão do Bluetooth SIG (nome do
 * dispositivo, informações do fabricante, bateria...) — nenhum deles carrega
 * dado de aplicação. Uma característica gravável ali (ex: "Device Name") não
 * tem nada a ver com o canal de impressão de verdade, que fica num serviço
 * customizado do fabricante.
 */
const IGNORED_SERVICE_UUIDS = new Set([
  "00001800-0000-1000-8000-00805f9b34fb", // Generic Access
  "00001801-0000-1000-8000-00805f9b34fb", // Generic Attribute
  "0000180a-0000-1000-8000-00805f9b34fb", // Device Information
  "0000180f-0000-1000-8000-00805f9b34fb", // Battery Service
]);

async function findWritableCharacteristic(device: Device): Promise<WritableCharacteristic> {
  const services = await device.services();

  for (const service of services) {
    const characteristics = await service.characteristics();
    console.log(
      `[Impressora] Serviço ${service.uuid}:`,
      characteristics.map((c) => `${c.uuid} (write=${c.isWritableWithResponse}, writeNoResp=${c.isWritableWithoutResponse}, notify=${c.isNotifiable})`),
    );
  }

  for (const service of services) {
    if (IGNORED_SERVICE_UUIDS.has(service.uuid.toLowerCase())) continue;

    const characteristics = await service.characteristics();
    const writable = characteristics.find(
      (characteristic) => characteristic.isWritableWithResponse || characteristic.isWritableWithoutResponse,
    );
    if (writable) {
      return {
        serviceUUID: service.uuid,
        characteristicUUID: writable.uuid,
        withoutResponse: writable.isWritableWithoutResponse,
      };
    }
  }
  throw new Error("Impressora conectada, mas nenhuma característica de escrita foi encontrada.");
}

async function connectToSavedDevice(bleManager: BleManager): Promise<Device | null> {
  const savedId = await SecureStore.getItemAsync(LAST_PRINTER_KEY);
  if (!savedId) return null;

  try {
    const device = await bleManager.connectToDevice(savedId, { timeout: CONNECT_TIMEOUT_MS });
    const discovered = await device.discoverAllServicesAndCharacteristics();
    console.log(`[Impressora] Reconectado direto na última impressora usada: ${discovered.name ?? "sem nome"} (${discovered.id})`);
    return discovered;
  } catch (err) {
    // Impressora desligada, fora de alcance ou pareada com outro id agora —
    // sem problema, o caminho normal (scan) resolve.
    console.log(`[Impressora] Não reconectou no id salvo (${savedId}), vai escanear de novo:`, err);
    return null;
  }
}

async function ensureBluetoothOn(bleManager: BleManager): Promise<void> {
  const state = await bleManager.state();
  if (state !== State.PoweredOn) {
    throw new Error(`Bluetooth não está ligado no aparelho (estado: ${state}).`);
  }
}

function scanForPrinter(bleManager: BleManager): Promise<Device> {
  console.log(`[Impressora] Escaneando por até ${SCAN_TIMEOUT_MS}ms, procurando nome com:`, PRINTER_NAME_HINTS);

  return new Promise((resolve, reject) => {
    const seen = new Map<string, string>();

    const timeout = setTimeout(() => {
      bleManager.stopDeviceScan();
      const list =
        [...seen.entries()].map(([id, name]) => `${name} (${id})`).join(", ") || "nenhum dispositivo";
      console.log(`[Impressora] Scan terminou sem achar. Vistos por Bluetooth: ${list}`);
      reject(new Error(`Nenhuma impressora encontrada. Vistos por Bluetooth: ${list}`));
    }, SCAN_TIMEOUT_MS);

    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        clearTimeout(timeout);
        bleManager.stopDeviceScan();
        console.log("[Impressora] Erro durante o scan:", error);
        reject(error);
        return;
      }
      if (!device) return;

      const name = device.name ?? device.localName ?? "sem nome";
      if (!seen.has(device.id)) {
        console.log(`[Impressora] Visto no scan: ${name} (${device.id})`);
      }
      seen.set(device.id, name);

      if (matchesPrinterName(device.name) || matchesPrinterName(device.localName)) {
        clearTimeout(timeout);
        bleManager.stopDeviceScan();
        console.log(`[Impressora] Nome bateu, conectando em: ${name} (${device.id})`);
        resolve(device);
      }
    });
  });
}

/** Converte o MTU negociado num tamanho de pedaço em caracteres base64. */
function base64ChunkSizeForMtu(mtu: number): number {
  // 3 bytes de cabeçalho ATT sobram do MTU pro payload de fato; cada grupo de
  // 3 bytes de payload vira 4 caracteres base64 — daí o múltiplo de 4.
  const payloadBytes = Math.max(mtu - 3, 20);
  return Math.max(Math.floor(payloadBytes / 3) * 4, 4);
}

function chunkBase64(base64: string, chunkChars: number): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < base64.length; offset += chunkChars) {
    chunks.push(base64.slice(offset, offset + chunkChars));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `base64` já vem como bytes ESC/POS prontos, montados pelo PWA. */
export async function printEscPos(base64: string): Promise<void> {
  console.log(`[Impressora] Pedido de impressão recebido: ${base64.length} caracteres base64.`);

  await ensurePermissions();
  const bleManager = getManager();
  await ensureBluetoothOn(bleManager);

  let device = await connectToSavedDevice(bleManager);
  if (!device) {
    const found = await scanForPrinter(bleManager);
    const connected = await found.connect();
    device = await connected.discoverAllServicesAndCharacteristics();
    await SecureStore.setItemAsync(LAST_PRINTER_KEY, device.id);
  }

  try {
    // iOS ignora o valor pedido e negocia o MTU sozinho; alguns chips Android
    // nem suportam a chamada — nos dois casos seguimos com o que já temos.
    device = await device.requestMTU(MTU_REQUEST);
  } catch (err) {
    console.log("[Impressora] requestMTU falhou, seguindo com o MTU atual:", err);
  }
  console.log(`[Impressora] MTU em uso: ${device.mtu}`);

  const { serviceUUID, characteristicUUID, withoutResponse } = await findWritableCharacteristic(device);
  console.log(
    `[Impressora] Característica de escrita: service=${serviceUUID} characteristic=${characteristicUUID} withoutResponse=${withoutResponse}`,
  );

  const chunkChars = base64ChunkSizeForMtu(device.mtu);
  const chunks = chunkBase64(base64, chunkChars);
  console.log(`[Impressora] Enviando em ${chunks.length} pedaço(s) de até ${chunkChars} caracteres base64.`);

  for (const [index, chunk] of chunks.entries()) {
    if (withoutResponse) {
      await bleManager.writeCharacteristicWithoutResponseForDevice(
        device.id,
        serviceUUID,
        characteristicUUID,
        chunk,
      );
    } else {
      await bleManager.writeCharacteristicWithResponseForDevice(
        device.id,
        serviceUUID,
        characteristicUUID,
        chunk,
      );
    }
    console.log(`[Impressora] Pedaço ${index + 1}/${chunks.length} enviado.`);
    await sleep(CHUNK_DELAY_MS);
  }

  console.log(`[Impressora] Impressão concluída em ${device.name ?? "sem nome"} (${device.id}).`);
}
