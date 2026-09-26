export const FORECAST_REGISTRY_TESTNET_ADDRESS =
  "0x33972A05C776116bB34cF106bDA0bD7E9ddbD743" as const;

export const FORECAST_REGISTRY_MAINNET_ADDRESS =
  "0x92A7a9F8ee4537414ACb3d2Bb35E5976B8F48Df9" as const;

export const FORECAST_REGISTRY_V2_ADDRESS =
  FORECAST_REGISTRY_TESTNET_ADDRESS;

export const FORECAST_REGISTRY_V2_ABI =
[
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "forecastId",
				"type": "uint256"
			}
		],
		"name": "claimReward",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [],
		"stateMutability": "nonpayable",
		"type": "constructor"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "forecastId",
				"type": "uint256"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "user",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "enum ForecastRegistryV2.ForecastStatus",
				"name": "status",
				"type": "uint8"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "endPrice",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "claimableReward",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "resolvedAt",
				"type": "uint256"
			}
		],
		"name": "ForecastResolved",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "forecastId",
				"type": "uint256"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "user",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "enum ForecastRegistryV2.Direction",
				"name": "direction",
				"type": "uint8"
			},
			{
				"indexed": false,
				"internalType": "uint32",
				"name": "duration",
				"type": "uint32"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "arenaPoints",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "startPrice",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "submittedAt",
				"type": "uint256"
			}
		],
		"name": "ForecastSubmitted",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "address",
				"name": "previousOwner",
				"type": "address"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "newOwner",
				"type": "address"
			}
		],
		"name": "OwnershipTransferred",
		"type": "event"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": false,
				"internalType": "bool",
				"name": "isPaused",
				"type": "bool"
			}
		],
		"name": "PauseUpdated",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "forecastId",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "endPrice",
				"type": "uint256"
			}
		],
		"name": "resolveForecast",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"anonymous": false,
		"inputs": [
			{
				"indexed": true,
				"internalType": "uint256",
				"name": "forecastId",
				"type": "uint256"
			},
			{
				"indexed": true,
				"internalType": "address",
				"name": "user",
				"type": "address"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "arenaPoints",
				"type": "uint256"
			},
			{
				"indexed": false,
				"internalType": "uint256",
				"name": "claimedAt",
				"type": "uint256"
			}
		],
		"name": "RewardClaimed",
		"type": "event"
	},
	{
		"inputs": [
			{
				"internalType": "bool",
				"name": "newPausedState",
				"type": "bool"
			}
		],
		"name": "setPaused",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "forecastId",
				"type": "uint256"
			},
			{
				"internalType": "enum ForecastRegistryV2.Direction",
				"name": "direction",
				"type": "uint8"
			},
			{
				"internalType": "uint32",
				"name": "duration",
				"type": "uint32"
			},
			{
				"internalType": "uint256",
				"name": "arenaPoints",
				"type": "uint256"
			},
			{
				"internalType": "uint256",
				"name": "startPrice",
				"type": "uint256"
			}
		],
		"name": "submitForecast",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "newOwner",
				"type": "address"
			}
		],
		"name": "transferOwnership",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "forecastId",
				"type": "uint256"
			}
		],
		"name": "getClaimableReward",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "forecastId",
				"type": "uint256"
			}
		],
		"name": "getForecast",
		"outputs": [
			{
				"components": [
					{
						"internalType": "uint256",
						"name": "forecastId",
						"type": "uint256"
					},
					{
						"internalType": "address",
						"name": "user",
						"type": "address"
					},
					{
						"internalType": "enum ForecastRegistryV2.Direction",
						"name": "direction",
						"type": "uint8"
					},
					{
						"internalType": "uint32",
						"name": "duration",
						"type": "uint32"
					},
					{
						"internalType": "uint256",
						"name": "arenaPoints",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "startPrice",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "endPrice",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "submittedAt",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "resolvedAt",
						"type": "uint256"
					},
					{
						"internalType": "uint256",
						"name": "claimableReward",
						"type": "uint256"
					},
					{
						"internalType": "enum ForecastRegistryV2.ForecastStatus",
						"name": "status",
						"type": "uint8"
					},
					{
						"internalType": "bool",
						"name": "claimed",
						"type": "bool"
					},
					{
						"internalType": "bool",
						"name": "exists",
						"type": "bool"
					}
				],
				"internalType": "struct ForecastRegistryV2.Forecast",
				"name": "",
				"type": "tuple"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "uint256",
				"name": "forecastId",
				"type": "uint256"
			}
		],
		"name": "hasClaimed",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "owner",
		"outputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "paused",
		"outputs": [
			{
				"internalType": "bool",
				"name": "",
				"type": "bool"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [
			{
				"internalType": "address",
				"name": "",
				"type": "address"
			}
		],
		"name": "totalClaimedArenaPoints",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "totalClaims",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "totalForecasts",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "totalResolvedForecasts",
		"outputs": [
			{
				"internalType": "uint256",
				"name": "",
				"type": "uint256"
			}
		],
		"stateMutability": "view",
		"type": "function"
	}
]   as const;