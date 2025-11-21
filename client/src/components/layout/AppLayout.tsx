import type { ReactNode } from 'react'
import { Navbar } from './Navbar'
import './layout.css'

interface AppLayoutProps {
  children: ReactNode
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  return (
    <div className="app-root">
      <Navbar />
      <main className="app-main">
        <div className="app-container">{children}</div>
      </main>
      <footer className="app-footer">A Project made using React + TypeScript</footer>
    </div>
  )
}
