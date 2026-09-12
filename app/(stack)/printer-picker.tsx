import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StatusBar, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getSelectedPrinterId,
  setSelectedPrinterId,
  startPrinterScan,
  type ScannedPrinter,
} from "@/lib/thermal-printer";

export default function PrinterPickerScreen() {
  const insets = useSafeAreaInsets();
  const [devices, setDevices] = useState<ScannedPrinter[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const stopScanRef = useRef<() => void>(() => {});

  useEffect(() => {
    getSelectedPrinterId().then(setSelectedId);
  }, []);

  useEffect(() => {
    let cancelled = false;

    startPrinterScan((device) => {
      if (cancelled) return;
      setDevices((prev) => {
        const index = prev.findIndex((d) => d.id === device.id);
        if (index === -1) return [...prev, device];
        // O nome às vezes chega num pacote de scan response separado, depois
        // do primeiro anúncio — sem isso a lista ficava travada em "Sem nome".
        if (prev[index].name === "Sem nome" && device.name !== "Sem nome") {
          const next = [...prev];
          next[index] = device;
          return next;
        }
        return prev;
      });
    })
      .then((stop) => {
        if (cancelled) {
          stop();
          return;
        }
        stopScanRef.current = stop;
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erro ao escanear Bluetooth.");
        setScanning(false);
      });

    return () => {
      cancelled = true;
      stopScanRef.current();
    };
  }, []);

  async function handleSelect(device: ScannedPrinter) {
    stopScanRef.current();
    setScanning(false);
    await setSelectedPrinterId(device.id);
    setSelectedId(device.id);
    router.back();
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>‹ Voltar</Text>
        </Pressable>
        <Text style={styles.title}>Impressora Bluetooth</Text>
        <View style={styles.headerSpacer} />
      </View>

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <Text style={styles.hint}>Toque no aparelho correspondente à sua impressora térmica.</Text>
      )}

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable style={styles.item} onPress={() => handleSelect(item)}>
            <View style={styles.itemText}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemId}>{item.id}</Text>
            </View>
            {item.id === selectedId && <Text style={styles.check}>✓</Text>}
          </Pressable>
        )}
        ListEmptyComponent={
          scanning ? (
            <View style={styles.empty}>
              <ActivityIndicator size="small" color="#1e3a5f" />
              <Text style={styles.emptyText}>Procurando aparelhos Bluetooth...</Text>
            </View>
          ) : (
            <Text style={styles.emptyText}>Nenhum aparelho encontrado.</Text>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f2e9d6" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(30,58,95,0.16)",
  },
  back: { fontSize: 15, color: "#1e3a5f" },
  title: { fontSize: 16, fontWeight: "700", color: "#1e3a5f" },
  headerSpacer: { width: 50 },
  hint: {
    fontSize: 12,
    color: "#8a7f68",
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  error: {
    color: "#a8332a",
    paddingHorizontal: 16,
    paddingTop: 10,
    fontSize: 13,
  },
  list: { padding: 16, gap: 8, flexGrow: 1 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#faf3e2",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  itemText: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: "600", color: "#1e3a5f" },
  itemId: { fontSize: 11, color: "#8a7f68", marginTop: 2 },
  check: { fontSize: 18, color: "#1e3a5f", fontWeight: "700" },
  empty: { alignItems: "center", paddingTop: 40, gap: 8 },
  emptyText: { color: "#8a7f68", fontSize: 13 },
});
