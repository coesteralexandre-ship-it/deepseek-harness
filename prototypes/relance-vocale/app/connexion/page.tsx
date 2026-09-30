import { Brand } from '@/components/brand'
import { LoginForm } from '@/components/login-form'

export const dynamic = 'force-dynamic'

/** Only internal paths are accepted as a return target. */
function safeNext(value: string | string[] | undefined): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ suite?: string | string[] }> }) {
  const { suite } = await searchParams
  return (
    <main className="mx-auto grid min-h-screen max-w-[420px] place-items-center px-5">
      <div className="w-full animate-rise">
        <Brand size="lg" />
        <h1 className="font-display mt-8 text-[32px] leading-[1.05]">L’espace de <span className="accent">relance.</span></h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-muted">Cet espace lance de vrais appels. Il est réservé aux personnes qui ont le code.</p>
        <LoginForm next={safeNext(suite)} />
      </div>
    </main>
  )
}
