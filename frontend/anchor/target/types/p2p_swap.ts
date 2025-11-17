/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/p2p_swap.json`.
 */
export type P2pSwap = {
  "address": "Fqww93pxMsRRk2V83TpPk2GSwKc64cS8ktpXp7TpHi9",
  "metadata": {
    "name": "p2pSwap",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "acceptOffer",
      "docs": [
        "Accept an offer and execute atomic token swap"
      ],
      "discriminator": [
        227,
        82,
        234,
        131,
        1,
        18,
        48,
        2
      ],
      "accounts": [
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "maker"
              },
              {
                "kind": "arg",
                "path": "offerId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "offer"
              },
              {
                "kind": "account",
                "path": "mintOffered"
              }
            ]
          }
        },
        {
          "name": "maker",
          "writable": true,
          "relations": [
            "offer"
          ]
        },
        {
          "name": "makerTokenAccountWanted",
          "writable": true
        },
        {
          "name": "taker",
          "writable": true,
          "signer": true
        },
        {
          "name": "takerTokenAccountWanted",
          "writable": true
        },
        {
          "name": "takerTokenAccountOffered",
          "writable": true
        },
        {
          "name": "mintOffered"
        },
        {
          "name": "mintWanted"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "offerId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "cancelOffer",
      "docs": [
        "Cancel an offer and return tokens to maker"
      ],
      "discriminator": [
        92,
        203,
        223,
        40,
        92,
        89,
        53,
        119
      ],
      "accounts": [
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "maker"
              },
              {
                "kind": "arg",
                "path": "offerId"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "offer"
              },
              {
                "kind": "account",
                "path": "mintOffered"
              }
            ]
          }
        },
        {
          "name": "makerTokenAccount",
          "writable": true
        },
        {
          "name": "mintOffered"
        },
        {
          "name": "maker",
          "writable": true,
          "signer": true,
          "relations": [
            "offer"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "offerId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "createOffer",
      "docs": [
        "Create a new swap offer by locking tokens in escrow"
      ],
      "discriminator": [
        237,
        233,
        192,
        168,
        248,
        7,
        249,
        241
      ],
      "accounts": [
        {
          "name": "userProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "maker"
              }
            ]
          }
        },
        {
          "name": "offer",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  111,
                  102,
                  102,
                  101,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "maker"
              },
              {
                "kind": "account",
                "path": "user_profile.offer_count",
                "account": "userProfile"
              }
            ]
          }
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "offer"
              },
              {
                "kind": "account",
                "path": "mintOffered"
              }
            ]
          }
        },
        {
          "name": "makerTokenAccount",
          "writable": true
        },
        {
          "name": "mintOffered"
        },
        {
          "name": "mintWanted"
        },
        {
          "name": "maker",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amountOffered",
          "type": "u64"
        },
        {
          "name": "amountWanted",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeUser",
      "docs": [
        "Initialize a new user profile to track offer count"
      ],
      "discriminator": [
        111,
        17,
        185,
        250,
        60,
        122,
        38,
        254
      ],
      "accounts": [
        {
          "name": "userProfile",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  117,
                  115,
                  101,
                  114,
                  95,
                  112,
                  114,
                  111,
                  102,
                  105,
                  108,
                  101
                ]
              },
              {
                "kind": "account",
                "path": "authority"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "offer",
      "discriminator": [
        215,
        88,
        60,
        71,
        170,
        162,
        73,
        229
      ]
    },
    {
      "name": "userProfile",
      "discriminator": [
        32,
        37,
        119,
        205,
        179,
        180,
        13,
        194
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidAmount",
      "msg": "Amount must be greater than zero"
    },
    {
      "code": 6001,
      "name": "insufficientBalance",
      "msg": "Insufficient token balance"
    },
    {
      "code": 6002,
      "name": "unauthorized",
      "msg": "Unauthorized: Only the maker can perform this action"
    },
    {
      "code": 6003,
      "name": "invalidMint",
      "msg": "Invalid token mint provided"
    },
    {
      "code": 6004,
      "name": "counterOverflow",
      "msg": "Offer counter overflow - maximum offers reached"
    },
    {
      "code": 6005,
      "name": "uninitializedUserProfile",
      "msg": "User profile must be initialized first"
    }
  ],
  "types": [
    {
      "name": "offer",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "offerId",
            "docs": [
              "Unique offer ID from user's counter"
            ],
            "type": "u64"
          },
          {
            "name": "maker",
            "docs": [
              "Offer creator's wallet"
            ],
            "type": "pubkey"
          },
          {
            "name": "mintOffered",
            "docs": [
              "Token mint being offered"
            ],
            "type": "pubkey"
          },
          {
            "name": "mintWanted",
            "docs": [
              "Token mint being requested"
            ],
            "type": "pubkey"
          },
          {
            "name": "amountOffered",
            "docs": [
              "Amount of offered tokens"
            ],
            "type": "u64"
          },
          {
            "name": "amountWanted",
            "docs": [
              "Amount of wanted tokens"
            ],
            "type": "u64"
          },
          {
            "name": "vaultBump",
            "docs": [
              "PDA bump for vault"
            ],
            "type": "u8"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump for offer account"
            ],
            "type": "u8"
          },
          {
            "name": "createdAt",
            "docs": [
              "Creation timestamp"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "userProfile",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "docs": [
              "The user's wallet address"
            ],
            "type": "pubkey"
          },
          {
            "name": "offerCount",
            "docs": [
              "Counter for creating unique offer IDs"
            ],
            "type": "u64"
          }
        ]
      }
    }
  ]
};
