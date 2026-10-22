import { useEffect, useState, type ReactNode } from "react"
import { ActivityIndicator, StyleSheet, Text, View } from "react-native"

import { storageReady } from "./storage-bootstrap"
import { hydratePersistedState } from "@repo/core/hydrate"

/**
 * 九键水合完成前不渲染业务树：杜绝「空读 → 整体覆写」丢数据窗口
 * （upsertToday / favorites / alerts / portfolio 读-改-写族）。
 * 水合完成后跑 hydratePersistedState 校正 locale/theme 与九键缓存。
 */
export function HydrationGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const p = storageReady ?? Promise.resolve()
    void p.then(() => {
      hydratePersistedState()
      setReady(true)
    })
  }, [])

  if (!ready) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color="#f9f9f9" />
        <Text style={styles.text}>CRYPTO STATUS</Text>
      </View>
    )
  }
  return <>{children}</>
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#171717" },
  text: { color: "#f9f9f9", fontSize: 13, letterSpacing: 2 },
})
