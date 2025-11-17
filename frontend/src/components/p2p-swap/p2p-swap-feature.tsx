'use client'

import { useWallet } from '@solana/wallet-adapter-react'
import { ExplorerLink } from '../cluster/cluster-ui'
import { WalletButton } from '../solana/solana-provider'
import { useP2pSwapProgram } from './p2p-swap-data-access'
import { P2pSwapCreate, P2pSwapList } from './p2p-swap-ui'
import { AppHero } from '../app-hero'
import { ellipsify } from '@/lib/utils'
import { useState } from 'react'
import { Button } from '../ui/button'

export default function P2pSwapFeature() {
  const { publicKey } = useWallet()
  const { programId } = useP2pSwapProgram()
  const [activeTab, setActiveTab] = useState<'create' | 'browse'>('create')

  return publicKey ? (
    <div>
      <AppHero title="P2P Token Swap" subtitle="Create and browse token swap offers on Solana">
        <p className="mb-6">
          <ExplorerLink path={`account/${programId}`} label={ellipsify(programId.toString())} />
        </p>
        <div className="flex gap-2 justify-center">
          <Button
            variant={activeTab === 'create' ? 'default' : 'outline'}
            onClick={() => setActiveTab('create')}
          >
            Create Offer
          </Button>
          <Button
            variant={activeTab === 'browse' ? 'default' : 'outline'}
            onClick={() => setActiveTab('browse')}
          >
            Browse Offers
          </Button>
        </div>
      </AppHero>
      <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
        {activeTab === 'create' ? <P2pSwapCreate /> : <P2pSwapList />}
      </div>
    </div>
  ) : (
    <div className="max-w-4xl mx-auto">
      <div className="hero py-[64px]">
        <div className="hero-content text-center">
          <div>
            <h1 className="text-5xl font-bold mb-4">P2P Token Swap</h1>
            <p className="mb-6">Connect your wallet to create and browse token swap offers</p>
            <WalletButton className="btn btn-primary" />
          </div>
        </div>
      </div>
    </div>
  )
}
