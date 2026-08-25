import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import App from "@/App"
import { Toaster } from "@/components/ui/sonner"
import { start as startTheme } from "@/lib/theme"
import { trackVisibleViewport } from "@/lib/viewport"
import "@/index.css"

// Before first paint, and for the life of the app: the keyboard changes what is
// visible without changing the layout viewport, and only this notices.
trackVisibleViewport()

// index.html has already put the right class on the document; this takes the
// choice over from it and keeps it in step with the phone from here on.
startTheme()

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Toaster position="top-center" richColors />
  </StrictMode>,
)
