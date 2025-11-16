import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { P2pSwap } from "../target/types/p2p_swap";
import {
  createMint,
  createAccount,
  mintTo,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { assert } from "chai";

describe("p2p_swap", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.local();
  anchor.setProvider(provider);

  const program = anchor.workspace.P2pSwap as Program<P2pSwap>;

  // Test accounts
  let mintA: PublicKey;
  let mintB: PublicKey;
  let makerTokenAccountA: PublicKey;
  let makerTokenAccountB: PublicKey;
  let takerTokenAccountA: PublicKey;
  let takerTokenAccountB: PublicKey;

  const maker = provider.wallet;
  const taker = Keypair.generate();

  // PDAs
  let makerUserProfile: PublicKey;
  let takerUserProfile: PublicKey;

  before(async () => {
    // Airdrop to taker
    const airdropSig = await provider.connection.requestAirdrop(
      taker.publicKey,
      2 * anchor.web3.LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(airdropSig);

    // Create two test tokens (Mint A and Mint B)
    mintA = await createMint(
      provider.connection,
      maker.payer,
      maker.publicKey,
      null,
      6 // decimals
    );

    mintB = await createMint(
      provider.connection,
      maker.payer,
      maker.publicKey,
      null,
      6 // decimals
    );

    // Create token accounts for maker
    makerTokenAccountA = await createAccount(
      provider.connection,
      maker.payer,
      mintA,
      maker.publicKey
    );

    makerTokenAccountB = await createAccount(
      provider.connection,
      maker.payer,
      mintB,
      maker.publicKey
    );

    // Create token accounts for taker
    takerTokenAccountA = await createAccount(
      provider.connection,
      taker,
      mintA,
      taker.publicKey
    );

    takerTokenAccountB = await createAccount(
      provider.connection,
      taker,
      mintB,
      taker.publicKey
    );

    // Mint tokens to maker and taker
    await mintTo(
      provider.connection,
      maker.payer,
      mintA,
      makerTokenAccountA,
      maker.publicKey,
      1000000 // 1 Token A (6 decimals)
    );

    await mintTo(
      provider.connection,
      maker.payer,
      mintB,
      takerTokenAccountB,
      maker.publicKey,
      2000000 // 2 Token B (6 decimals)
    );

    // Derive PDA addresses
    [makerUserProfile] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_profile"), maker.publicKey.toBuffer()],
      program.programId
    );

    [takerUserProfile] = PublicKey.findProgramAddressSync(
      [Buffer.from("user_profile"), taker.publicKey.toBuffer()],
      program.programId
    );
  });

  describe("initialize_user", () => {
    it("Successfully initializes user profile", async () => {
      await program.methods
        .initializeUser()
        .accounts({
          userProfile: makerUserProfile,
          authority: maker.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const userProfile = await program.account.userProfile.fetch(makerUserProfile);
      assert.equal(userProfile.authority.toBase58(), maker.publicKey.toBase58());
      assert.equal(userProfile.offerCount.toNumber(), 0);
    });

    it("Cannot initialize user profile twice for same user", async () => {
      try {
        await program.methods
          .initializeUser()
          .accounts({
            userProfile: makerUserProfile,
            authority: maker.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        assert.fail("Should have failed to initialize twice");
      } catch (err) {
        // Expected to fail
        assert.ok(err);
      }
    });

    it("Successfully initializes taker user profile", async () => {
      await program.methods
        .initializeUser()
        .accounts({
          userProfile: takerUserProfile,
          authority: taker.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([taker])
        .rpc();

      const userProfile = await program.account.userProfile.fetch(takerUserProfile);
      assert.equal(userProfile.authority.toBase58(), taker.publicKey.toBase58());
      assert.equal(userProfile.offerCount.toNumber(), 0);
    });
  });

  describe("create_offer", () => {
    let offer0: PublicKey;
    let vault0: PublicKey;

    it("Successfully creates first offer", async () => {
      // Get current offer count
      const userProfile = await program.account.userProfile.fetch(makerUserProfile);
      const offerId = userProfile.offerCount;

      // Derive offer and vault PDAs
      [offer0] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("offer"),
          maker.publicKey.toBuffer(),
          offerId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      [vault0] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), offer0.toBuffer(), mintA.toBuffer()],
        program.programId
      );

      const amountOffered = new BN(100000); // 0.1 Token A
      const amountWanted = new BN(200000); // 0.2 Token B

      await program.methods
        .createOffer(amountOffered, amountWanted)
        .accounts({
          offer: offer0,
          vault: vault0,
          userProfile: makerUserProfile,
          makerTokenAccount: makerTokenAccountA,
          mintOffered: mintA,
          mintWanted: mintB,
          maker: maker.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      // Verify offer account
      const offer = await program.account.offer.fetch(offer0);
      assert.equal(offer.offerId.toNumber(), 0);
      assert.equal(offer.maker.toBase58(), maker.publicKey.toBase58());
      assert.equal(offer.mintOffered.toBase58(), mintA.toBase58());
      assert.equal(offer.mintWanted.toBase58(), mintB.toBase58());
      assert.equal(offer.amountOffered.toNumber(), amountOffered.toNumber());
      assert.equal(offer.amountWanted.toNumber(), amountWanted.toNumber());

      // Verify tokens were transferred to vault
      const vaultAccount = await getAccount(provider.connection, vault0);
      assert.equal(vaultAccount.amount.toString(), amountOffered.toString());

      // Verify user profile counter incremented
      const updatedProfile = await program.account.userProfile.fetch(makerUserProfile);
      assert.equal(updatedProfile.offerCount.toNumber(), 1);
    });

    it("Rejects offer with zero amount_offered", async () => {
      const userProfile = await program.account.userProfile.fetch(makerUserProfile);
      const offerId = userProfile.offerCount;

      const [offerPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("offer"),
          maker.publicKey.toBuffer(),
          offerId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), offerPDA.toBuffer(), mintA.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .createOffer(new BN(0), new BN(100000))
          .accounts({
            offer: offerPDA,
            vault: vaultPDA,
            userProfile: makerUserProfile,
            makerTokenAccount: makerTokenAccountA,
            mintOffered: mintA,
            mintWanted: mintB,
            maker: maker.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .rpc();
        assert.fail("Should have failed with zero amount");
      } catch (err) {
        assert.include(err.toString(), "InvalidAmount");
      }
    });

    it("Rejects offer with zero amount_wanted", async () => {
      const userProfile = await program.account.userProfile.fetch(makerUserProfile);
      const offerId = userProfile.offerCount;

      const [offerPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("offer"),
          maker.publicKey.toBuffer(),
          offerId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), offerPDA.toBuffer(), mintA.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .createOffer(new BN(100000), new BN(0))
          .accounts({
            offer: offerPDA,
            vault: vaultPDA,
            userProfile: makerUserProfile,
            makerTokenAccount: makerTokenAccountA,
            mintOffered: mintA,
            mintWanted: mintB,
            maker: maker.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
            rent: SYSVAR_RENT_PUBKEY,
          })
          .rpc();
        assert.fail("Should have failed with zero amount");
      } catch (err) {
        assert.include(err.toString(), "InvalidAmount");
      }
    });

    it("Successfully creates second offer (multiple offers per user)", async () => {
      const userProfile = await program.account.userProfile.fetch(makerUserProfile);
      const offerId = userProfile.offerCount;

      const [offer1] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("offer"),
          maker.publicKey.toBuffer(),
          offerId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const [vault1] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), offer1.toBuffer(), mintA.toBuffer()],
        program.programId
      );

      await program.methods
        .createOffer(new BN(50000), new BN(100000))
        .accounts({
          offer: offer1,
          vault: vault1,
          userProfile: makerUserProfile,
          makerTokenAccount: makerTokenAccountA,
          mintOffered: mintA,
          mintWanted: mintB,
          maker: maker.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      const offer = await program.account.offer.fetch(offer1);
      assert.equal(offer.offerId.toNumber(), 1);

      // Verify counter incremented
      const updatedProfile = await program.account.userProfile.fetch(makerUserProfile);
      assert.equal(updatedProfile.offerCount.toNumber(), 2);
    });
  });

  describe("cancel_offer", () => {
    it("Successfully cancels offer by maker", async () => {
      const offerId = new BN(1); // Cancel the second offer

      const [offerPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("offer"),
          maker.publicKey.toBuffer(),
          offerId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), offerPDA.toBuffer(), mintA.toBuffer()],
        program.programId
      );

      // Get maker's token balance before
      const beforeBalance = await getAccount(provider.connection, makerTokenAccountA);

      await program.methods
        .cancelOffer(offerId)
        .accounts({
          offer: offerPDA,
          vault: vaultPDA,
          makerTokenAccount: makerTokenAccountA,
          mintOffered: mintA,
          maker: maker.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Verify maker received tokens back
      const afterBalance = await getAccount(provider.connection, makerTokenAccountA);
      assert.ok(Number(afterBalance.amount) > Number(beforeBalance.amount));

      // Verify offer account is closed
      try {
        await program.account.offer.fetch(offerPDA);
        assert.fail("Offer account should be closed");
      } catch (err) {
        assert.ok(err);
      }
    });

    it("Rejects cancel by non-maker", async () => {
      const offerId = new BN(0); // Try to cancel first offer

      const [offerPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("offer"),
          maker.publicKey.toBuffer(),
          offerId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), offerPDA.toBuffer(), mintA.toBuffer()],
        program.programId
      );

      try {
        await program.methods
          .cancelOffer(offerId)
          .accounts({
            offer: offerPDA,
            vault: vaultPDA,
            makerTokenAccount: makerTokenAccountA,
            mintOffered: mintA,
            maker: taker.publicKey, // Wrong maker!
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([taker])
          .rpc();
        assert.fail("Should have failed - wrong maker");
      } catch (err) {
        // Expected to fail due to constraint
        assert.ok(err);
      }
    });
  });

  describe("accept_offer", () => {
    it("Successfully accepts offer with atomic swap", async () => {
      const offerId = new BN(0);

      const [offerPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("offer"),
          maker.publicKey.toBuffer(),
          offerId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), offerPDA.toBuffer(), mintA.toBuffer()],
        program.programId
      );

      // Get balances before
      const makerBalanceB_before = await getAccount(provider.connection, makerTokenAccountB);
      const takerBalanceA_before = await getAccount(provider.connection, takerTokenAccountA);
      const takerBalanceB_before = await getAccount(provider.connection, takerTokenAccountB);

      await program.methods
        .acceptOffer(offerId)
        .accounts({
          offer: offerPDA,
          vault: vaultPDA,
          maker: maker.publicKey,
          makerTokenAccountWanted: makerTokenAccountB,
          taker: taker.publicKey,
          takerTokenAccountWanted: takerTokenAccountA,
          takerTokenAccountOffered: takerTokenAccountB,
          mintOffered: mintA,
          mintWanted: mintB,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([taker])
        .rpc();

      // Verify token balances changed correctly
      const makerBalanceB_after = await getAccount(provider.connection, makerTokenAccountB);
      const takerBalanceA_after = await getAccount(provider.connection, takerTokenAccountA);
      const takerBalanceB_after = await getAccount(provider.connection, takerTokenAccountB);

      // Maker should have received Token B
      assert.ok(Number(makerBalanceB_after.amount) > Number(makerBalanceB_before.amount));
      // Taker should have received Token A
      assert.ok(Number(takerBalanceA_after.amount) > Number(takerBalanceA_before.amount));
      // Taker should have sent Token B
      assert.ok(Number(takerBalanceB_after.amount) < Number(takerBalanceB_before.amount));

      // Verify offer and vault are closed
      try {
        await program.account.offer.fetch(offerPDA);
        assert.fail("Offer should be closed");
      } catch (err) {
        assert.ok(err);
      }

      try {
        await getAccount(provider.connection, vaultPDA);
        assert.fail("Vault should be closed");
      } catch (err) {
        assert.ok(err);
      }
    });

    it("Rejects accept with wrong token mints", async () => {
      // First create a new offer
      const userProfile = await program.account.userProfile.fetch(makerUserProfile);
      const offerId = userProfile.offerCount;

      const [offerPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("offer"),
          maker.publicKey.toBuffer(),
          offerId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), offerPDA.toBuffer(), mintA.toBuffer()],
        program.programId
      );

      await program.methods
        .createOffer(new BN(50000), new BN(100000))
        .accounts({
          offer: offerPDA,
          vault: vaultPDA,
          userProfile: makerUserProfile,
          makerTokenAccount: makerTokenAccountA,
          mintOffered: mintA,
          mintWanted: mintB,
          maker: maker.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      // Try to accept with wrong mint
      try {
        await program.methods
          .acceptOffer(offerId)
          .accounts({
            offer: offerPDA,
            vault: vaultPDA,
            maker: maker.publicKey,
            makerTokenAccountWanted: makerTokenAccountB,
            taker: taker.publicKey,
            takerTokenAccountWanted: takerTokenAccountA,
            takerTokenAccountOffered: takerTokenAccountB,
            mintOffered: mintB, // WRONG MINT!
            mintWanted: mintB,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([taker])
          .rpc();
        assert.fail("Should have failed with wrong mint");
      } catch (err) {
        // Accept either our custom error or Anchor's constraint error
        // Both indicate the wrong mint was rejected
        const errorStr = err.toString();
        assert.ok(
          errorStr.includes("InvalidMint") || errorStr.includes("vault"),
          "Should fail due to invalid mint"
        );
      }
    });
  });

  describe("Full swap flow", () => {
    it("Complete end-to-end swap works correctly", async () => {
      // 1. Create offer
      const userProfile = await program.account.userProfile.fetch(makerUserProfile);
      const offerId = userProfile.offerCount;

      const [offerPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("offer"),
          maker.publicKey.toBuffer(),
          offerId.toArrayLike(Buffer, "le", 8),
        ],
        program.programId
      );

      const [vaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), offerPDA.toBuffer(), mintA.toBuffer()],
        program.programId
      );

      await program.methods
        .createOffer(new BN(75000), new BN(150000))
        .accounts({
          offer: offerPDA,
          vault: vaultPDA,
          userProfile: makerUserProfile,
          makerTokenAccount: makerTokenAccountA,
          mintOffered: mintA,
          mintWanted: mintB,
          maker: maker.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      // 2. Accept offer
      await program.methods
        .acceptOffer(offerId)
        .accounts({
          offer: offerPDA,
          vault: vaultPDA,
          maker: maker.publicKey,
          makerTokenAccountWanted: makerTokenAccountB,
          taker: taker.publicKey,
          takerTokenAccountWanted: takerTokenAccountA,
          takerTokenAccountOffered: takerTokenAccountB,
          mintOffered: mintA,
          mintWanted: mintB,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([taker])
        .rpc();

      // Verify everything is cleaned up
      try {
        await program.account.offer.fetch(offerPDA);
        assert.fail("Offer should be closed");
      } catch (err) {
        assert.ok(err);
      }
    });
  });
});
