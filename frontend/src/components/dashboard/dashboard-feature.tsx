import { AppHero } from '@/components/app-hero'
import Link from 'next/link'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'

const links: { label: string; href: string }[] = [
  { label: 'Solana Docs', href: 'https://docs.solana.com/' },
  { label: 'Solana Faucet', href: 'https://faucet.solana.com/' },
  { label: 'Solana Cookbook', href: 'https://solana.com/developers/cookbook/' },
  { label: 'Solana Stack Overflow', href: 'https://solana.stackexchange.com/' },
  { label: 'Solana Developers GitHub', href: 'https://github.com/solana-developers/' },
]

export function DashboardFeature() {
  return (
    <div>
      <AppHero title="P2P Token Swap" subtitle="Decentralized peer-to-peer token swaps on Solana" />
      <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 md:grid-cols-2 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>🔄 Token Swap</CardTitle>
              <CardDescription>Create and browse peer-to-peer token swap offers</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Lock your tokens in escrow and specify what you want in return. Other users can browse and accept your offers for atomic swaps.
              </p>
              <Link href="/p2p-swap">
                <Button className="w-full">Launch App</Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>📚 Resources</CardTitle>
              <CardDescription>Helpful links to get you started</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {links.map((link, index) => (
                  <div key={index}>
                    <a
                      href={link.href}
                      className="text-sm hover:text-gray-500 dark:hover:text-gray-300"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {link.label}
                    </a>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li><strong>Create Offer:</strong> Lock tokens in escrow and specify what you want in return</li>
              <li><strong>Browse Offers:</strong> See all available swap offers from other users</li>
              <li><strong>Accept Offer:</strong> Atomically swap tokens with the offer creator</li>
              <li><strong>Cancel Offer:</strong> Retrieve your locked tokens if you change your mind</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
