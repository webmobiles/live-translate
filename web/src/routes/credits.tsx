import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/credits')({
  component: CreditsPage,
})

function CreditsPage() {
  return <main className="min-h-screen bg-lt-bg" />
}
