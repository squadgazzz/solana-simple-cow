'use client'

import { PublicKey } from '@solana/web3.js'
import { ellipsify } from '@/lib/utils'
import { ExplorerLink } from '../cluster/cluster-ui'
import { useP2pSwapProgram } from './p2p-swap-data-access'
import { useState } from 'react'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Label } from '../ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'

export function P2pSwapCreate() {
  const { createOffer } = useP2pSwapProgram()
  const [mintOffered, setMintOffered] = useState('')
  const [mintWanted, setMintWanted] = useState('')
  const [amountOffered, setAmountOffered] = useState('')
  const [amountWanted, setAmountWanted] = useState('')

  const handleSubmit = () => {
    if (!mintOffered || !mintWanted || !amountOffered || !amountWanted) {
      return
    }

    createOffer.mutateAsync({
      mintOffered: new PublicKey(mintOffered),
      mintWanted: new PublicKey(mintWanted),
      amountOffered: parseInt(amountOffered),
      amountWanted: parseInt(amountWanted),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Swap Offer</CardTitle>
        <CardDescription>Lock tokens in escrow and specify what you want in return</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="mint-offered">Token Mint Offered</Label>
            <Input
              id="mint-offered"
              placeholder="Enter token mint address (e.g., So11...)"
              value={mintOffered}
              onChange={(e) => setMintOffered(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Your token account will be automatically detected
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount-offered">Amount Offered (base units)</Label>
            <Input
              id="amount-offered"
              type="number"
              placeholder="e.g., 1000000 for 1 USDC"
              value={amountOffered}
              onChange={(e) => setAmountOffered(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Enter amount in smallest units (e.g., 1 SOL = 1000000000 lamports)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mint-wanted">Token Mint Wanted</Label>
            <Input
              id="mint-wanted"
              placeholder="Enter token mint address you want"
              value={mintWanted}
              onChange={(e) => setMintWanted(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount-wanted">Amount Wanted (base units)</Label>
            <Input
              id="amount-wanted"
              type="number"
              placeholder="e.g., 100000000 for 100 USDC"
              value={amountWanted}
              onChange={(e) => setAmountWanted(e.target.value)}
            />
          </div>

          <Button onClick={handleSubmit} disabled={createOffer.isPending} className="w-full">
            {createOffer.isPending ? 'Creating...' : 'Create Offer'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function P2pSwapList() {
  const { accounts, acceptOffer } = useP2pSwapProgram()

  if (accounts.isLoading) {
    return <div>Loading offers...</div>
  }

  if (!accounts.data || accounts.data.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">No offers available</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Available Swap Offers</CardTitle>
          <CardDescription>Browse and accept token swap offers</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Maker</TableHead>
                <TableHead>Offering</TableHead>
                <TableHead>Wanting</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.data.map((account) => {
                const offer = account.account
                const date = new Date(offer.createdAt.toNumber() * 1000).toLocaleDateString()

                return (
                  <TableRow key={account.publicKey.toString()}>
                    <TableCell>{offer.offerId.toString()}</TableCell>
                    <TableCell>
                      <ExplorerLink path={`account/${offer.maker}`} label={ellipsify(offer.maker.toString())} />
                    </TableCell>
                    <TableCell>
                      {offer.amountOffered.toString()}
                      <br />
                      <span className="text-xs text-muted-foreground">{ellipsify(offer.mintOffered.toString())}</span>
                    </TableCell>
                    <TableCell>
                      {offer.amountWanted.toString()}
                      <br />
                      <span className="text-xs text-muted-foreground">{ellipsify(offer.mintWanted.toString())}</span>
                    </TableCell>
                    <TableCell>{date}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        onClick={() => {
                          acceptOffer.mutateAsync({
                            offerId: offer.offerId.toNumber(),
                            maker: offer.maker,
                            mintOffered: offer.mintOffered,
                            mintWanted: offer.mintWanted,
                          })
                        }}
                        disabled={acceptOffer.isPending}
                      >
                        {acceptOffer.isPending ? 'Accepting...' : 'Accept'}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
