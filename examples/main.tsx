import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Inter ships with the page: otherwise browsers use a local copy if there is
// one, which some activate only after the first paint, and all text reflows
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import './reset.css'
import { App } from './App'

// The first paint already uses Inter: wait for the weights the page uses
// (at most a second, then render with what is there)
const fonts = ['400', '500', '600', '700'].map(weight => document.fonts.load(`${weight} 1em Inter`))
const timeout = new Promise(resolve => setTimeout(resolve, 1000))

Promise.race([Promise.all(fonts), timeout]).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
})
