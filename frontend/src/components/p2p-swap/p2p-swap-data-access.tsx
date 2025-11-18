'use client'

import { getP2pSwapProgram, getP2pSwapProgramId } from '@project/anchor'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { Cluster, PublicKey, Transaction } from '@solana/web3.js'
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useCluster } from '../cluster/cluster-data-access'
import { useAnchorProvider } from '../solana/solana-provider'
import { useTransactionToast } from '../use-transaction-toast'
import { toast } from 'sonner'
import BN from 'bn.js'

export function useP2pSwapProgram() {
  const { connection } = useConnection()
  const { cluster } = useCluster()
  const transactionToast = useTransactionToast()
  const provider = useAnchorProvider()
  const { publicKey } = useWallet()
  const programId = useMemo(() => getP2pSwapProgramId(cluster.network as Cluster), [cluster])
  const program = useMemo(() => getP2pSwapProgram(provider, programId), [provider, programId])

  const accounts = useQuery({
    queryKey: ['p2p-swap', 'all', { cluster }],
    queryFn: () => program.account.offer.all(),
  })

  const getProgramAccount = useQuery({
    queryKey: ['get-program-account', { cluster }],
    queryFn: () => connection.getParsedAccountInfo(programId),
  })

  const createOffer = useMutation({
    mutationKey: ['p2p-swap', 'create', { cluster }],
    mutationFn: async ({
      mintOffered,
      mintWanted,
      amountOffered,
      amountWanted,
    }: {
      mintOffered: PublicKey
      mintWanted: PublicKey
      amountOffered: number
      amountWanted: number
    }) => {
      if (!publicKey) throw new Error('Wallet not connected')

      // Auto-derive maker's token account
      const makerTokenAccount = await getAssociatedTokenAddress(mintOffered, publicKey)

      // Verify the token account exists
      const accountInfo = await connection.getAccountInfo(makerTokenAccount)
      if (!accountInfo) {
        throw new Error(
          `You don't have a token account for this mint. Please create one first using: spl-token create-account ${mintOffered.toBase58()}`
        )
      }

      // Derive PDAs
      const [userProfile] = PublicKey.findProgramAddressSync(
        [Buffer.from('user_profile'), publicKey.toBuffer()],
        programId
      )

      // Fetch user profile to get offer count
      let offerCount = 0
      try {
        const userProfileAccount = await program.account.userProfile.fetch(userProfile)
        offerCount = userProfileAccount.offerCount.toNumber()
      } catch {
        // User profile doesn't exist yet, will be auto-initialized
        offerCount = 0
      }

      const [offer] = PublicKey.findProgramAddressSync(
        [Buffer.from('offer'), publicKey.toBuffer(), new BN(offerCount).toArrayLike(Buffer, 'le', 8)],
        programId
      )

      const [vault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), offer.toBuffer(), mintOffered.toBuffer()],
        programId
      )

      return program.methods
        .createOffer(new BN(amountOffered), new BN(amountWanted))
        .accountsPartial({
          offer,
          vault,
          makerTokenAccount,
          mintOffered,
          mintWanted,
          maker: publicKey,
        })
        .rpc()
    },
    onSuccess: (signature) => {
      transactionToast(signature)
      accounts.refetch()
    },
    onError: (error) => {
      toast.error(`Failed to create offer: ${error.message}`)
    },
  })

  const acceptOffer = useMutation({
    mutationKey: ['p2p-swap', 'accept', { cluster }],
    mutationFn: async ({
      offerId,
      maker,
      mintOffered,
      mintWanted,
    }: {
      offerId: number
      maker: PublicKey
      mintOffered: PublicKey
      mintWanted: PublicKey
    }) => {
      if (!publicKey) throw new Error('Wallet not connected')

      // Auto-derive all token accounts
      const makerTokenAccountWanted = await getAssociatedTokenAddress(mintWanted, maker)
      const takerTokenAccountOffered = await getAssociatedTokenAddress(mintWanted, publicKey)
      const takerTokenAccountWanted = await getAssociatedTokenAddress(mintOffered, publicKey)

      // Derive PDAs for offer and vault
      const [offer] = PublicKey.findProgramAddressSync(
        [Buffer.from('offer'), maker.toBuffer(), new BN(offerId).toArrayLike(Buffer, 'le', 8)],
        programId
      )

      const [vault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), offer.toBuffer(), mintOffered.toBuffer()],
        programId
      )

      // Build transaction with ATA creation instructions (idempotent - safe if accounts exist)
      const transaction = new Transaction()

      // Add instruction to create taker's ATA for the wanted token (token they're giving)
      transaction.add(
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,                // payer (taker pays for their own ATA)
          takerTokenAccountOffered, // ATA address
          publicKey,                // owner
          mintWanted,               // mint
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      )

      // Add instruction to create taker's ATA for the offered token (token they're receiving)
      transaction.add(
        createAssociatedTokenAccountIdempotentInstruction(
          publicKey,               // payer (taker pays for their own ATA)
          takerTokenAccountWanted, // ATA address
          publicKey,               // owner
          mintOffered,             // mint
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      )

      // Add the accept_offer program instruction
      const acceptInstruction = await program.methods
        .acceptOffer(new BN(offerId))
        .accountsPartial({
          offer,
          vault,
          maker,
          makerTokenAccountWanted,
          taker: publicKey,
          takerTokenAccountWanted,
          takerTokenAccountOffered,
          mintOffered,
          mintWanted,
        })
        .instruction()

      transaction.add(acceptInstruction)

      // Send the combined transaction
      const signature = await provider.sendAndConfirm(transaction)
      return signature
    },
    onSuccess: (signature) => {
      transactionToast(signature)
      accounts.refetch()
    },
    onError: (error) => {
      toast.error(`Failed to accept offer: ${error.message}`)
    },
  })

  const cancelOffer = useMutation({
    mutationKey: ['p2p-swap', 'cancel', { cluster }],
    mutationFn: async ({
      offerId,
      makerTokenAccount,
      mintOffered,
    }: {
      offerId: number
      makerTokenAccount: PublicKey
      mintOffered: PublicKey
    }) => {
      if (!publicKey) throw new Error('Wallet not connected')

      const [offer] = PublicKey.findProgramAddressSync(
        [Buffer.from('offer'), publicKey.toBuffer(), new BN(offerId).toArrayLike(Buffer, 'le', 8)],
        programId
      )

      const [vault] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), offer.toBuffer(), mintOffered.toBuffer()],
        programId
      )

      return program.methods
        .cancelOffer(new BN(offerId))
        .accountsPartial({
          offer,
          vault,
          makerTokenAccount,
          mintOffered,
          maker: publicKey,
        })
        .rpc()
    },
    onSuccess: (signature) => {
      transactionToast(signature)
      accounts.refetch()
    },
    onError: (error) => {
      toast.error(`Failed to cancel offer: ${error.message}`)
    },
  })

  return {
    program,
    programId,
    accounts,
    getProgramAccount,
    createOffer,
    acceptOffer,
    cancelOffer,
  }
}
