import { BleManager, type Device } from "react-native-ble-plx";
import { PermissionsAndroid, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Guarda o id do último dispositivo BLE que imprimiu com sucesso, pra pular o
// scan (que demora alguns segundos) nas próximas impressões.
const LAST_PRINTER_KEY = "cd_last_printer_id";
const SCAN_TIMEOUT_MS = 10000;
const CONNECT_TIMEOUT_MS = 5000;
// 240 é múltiplo de 4: cada pedaço da string base64 continua sendo base64
// válido por conta própria, sem precisar decodificar/recodificar os bytes.
const CHUNK_CHARS = 240;
const CHUNK_DELAY_MS = 20;

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

async function findWritableCharacteristic(device: Device): Promise<WritableCharacteristic> {
  const services = await device.services();
  for (const service of services) {
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
    return await device.discoverAllServicesAndCharacteristics();
  } catch {
    // Impressora desligada, fora de alcance ou pareada com outro id agora —
    // sem problema, o caminho normal (scan) resolve.
    return null;
  }
}

function scanForPrinter(bleManager: BleManager): Promise<Device> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      bleManager.stopDeviceScan();
      reject(new Error("Nenhuma impressora encontrada. Confirme que ela está ligada perto do aparelho."));
    }, SCAN_TIMEOUT_MS);

    bleManager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        clearTimeout(timeout);
        bleManager.stopDeviceScan();
        reject(error);
        return;
      }
      if (device && (matchesPrinterName(device.name) || matchesPrinterName(device.localName))) {
        clearTimeout(timeout);
        bleManager.stopDeviceScan();
        resolve(device);
      }
    });
  });
}

function chunkBase64(base64: string): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < base64.length; offset += CHUNK_CHARS) {
    chunks.push(base64.slice(offset, offset + CHUNK_CHARS));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `base64` já vem como bytes ESC/POS prontos, montados pelo PWA. */
export async function printEscPos(base64: string): Promise<void> {
  await ensurePermissions();
  const bleManager = getManager();

  let device = await connectToSavedDevice(bleManager);
  if (!device) {
    const found = await scanForPrinter(bleManager);
    const connected = await found.connect();
    device = await connected.discoverAllServicesAndCharacteristics();
    await SecureStore.setItemAsync(LAST_PRINTER_KEY, device.id);
  }

  const { serviceUUID, characteristicUUID, withoutResponse } = await findWritableCharacteristic(device);

  for (const chunk of chunkBase64(base64)) {
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
    await sleep(CHUNK_DELAY_MS);
  }
}
