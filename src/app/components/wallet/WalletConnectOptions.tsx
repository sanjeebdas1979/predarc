"use client";

import { useState } from "react";
import { useConnect } from "wagmi";

type WalletConnectOptionsProps = {
  compact?: boolean;
  className?: string;
};

const WALLETS = [
  {
    id: "metaMask",
    rdns: "io.metamask",
    label: "MetaMask",
    match: "metamask",
    classes:
      "border-orange-400/35 bg-orange-400/10 text-orange-100 hover:border-orange-300/60 hover:bg-orange-400/20",
  },
  {
    id: "rabby",
    rdns: "io.rabby",
    label: "Rabby",
    match: "rabby",
    classes:
      "border-blue-400/35 bg-blue-400/10 text-blue-100 hover:border-blue-300/60 hover:bg-blue-400/20",
  },
] as const;

function readableConnectError(
  error: Error,
  walletName: string
): string {
  const message = error.message.toLowerCase();

  if (
    message.includes("provider not found") ||
    message.includes("not detected")
  ) {
    return `${walletName} was not detected. Install or unlock the extension, then refresh the page.`;
  }

  if (
    message.includes("rejected") ||
    message.includes("denied")
  ) {
    return `${walletName} connection was cancelled.`;
  }

  return `Could not connect ${walletName}. Confirm that the extension is unlocked and try again.`;
}

export default function WalletConnectOptions({
  compact = false,
  className = "",
}: WalletConnectOptionsProps) {
  const {
    connect,
    connectors,
    error,
    isPending,
  } = useConnect();
  const [selectedWallet, setSelectedWallet] = useState("wallet");

  const options = WALLETS.map((wallet) => {
    const announcedConnector = connectors.find((connector) => {
      const connectorRdns = Array.isArray(connector.rdns)
        ? connector.rdns
        : [connector.rdns];

      return (
        connector.id === wallet.rdns ||
        connectorRdns.includes(wallet.rdns)
      );
    });
    const fallbackConnector = connectors.find(
      (connector) =>
        connector.id === wallet.id ||
        connector.name.toLowerCase().includes(wallet.match)
    );

    return {
      ...wallet,
      connector: announcedConnector ?? fallbackConnector,
    };
  });

  return (
    <div className={className}>
      <div
        role="group"
        aria-label="Choose a wallet"
        className={
          compact
            ? "flex flex-wrap items-center gap-2"
            : "grid w-full grid-cols-2 gap-2"
        }
      >
        {options.map((wallet) => {
          const isSelected =
            isPending &&
            selectedWallet === wallet.label;

          return (
            <button
              key={wallet.id}
              type="button"
              disabled={isPending || !wallet.connector}
              onClick={() => {
                if (!wallet.connector) return;
                setSelectedWallet(wallet.label);
                connect({ connector: wallet.connector });
              }}
              className={`${
                compact
                  ? "rounded-xl px-3 py-2 text-xs"
                  : "rounded-xl px-4 py-3 text-sm"
              } border font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${wallet.classes}`}
            >
              {isSelected
                ? `Connecting ${wallet.label}...`
                : compact
                  ? wallet.label
                  : `Connect ${wallet.label}`}
            </button>
          );
        })}
      </div>

      {error && (
        <p
          role="alert"
          className={`${compact ? "mt-2 text-xs" : "mt-3 text-sm"} max-w-sm text-red-300`}
        >
          {readableConnectError(error, selectedWallet)}
        </p>
      )}

      {!options.some((wallet) => wallet.connector) && (
        <p className="mt-2 text-xs text-gray-400">
          Open Predarc in a browser with MetaMask or Rabby installed.
        </p>
      )}
    </div>
  );
}
