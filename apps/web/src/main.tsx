import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import "./lib/theme-dom"
import { configureCG } from "@repo/data/cg"
import App from "./App.tsx"

// CoinGecko demo key 入口注入（取数层不读 import.meta.env，RN 侧同构）
configureCG({ demoKey: import.meta.env.VITE_CG_KEY })

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
