import { ImageResponse } from "next/og";

export const alt = "Predarc Forecast Arena";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "70px",
          color: "white",
          background:
            "linear-gradient(135deg, #070b12 0%, #101b2b 55%, #071018 100%)",
          fontFamily: "Arial",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              color: "#fb923c",
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: 5,
            }}
          >
            PREDARC
          </div>

          <div style={{ display: "flex", fontSize: 64, fontWeight: 900 }}>
            Forecast Arena
          </div>

          <div style={{ display: "flex", color: "#cbd5e1", fontSize: 28 }}>
            Live crypto market forecasts on Arc Mainnet
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", color: "#94a3b8", fontSize: 22 }}>
              BTC/USDT ? LIVE MARKET
            </div>
            <div style={{ display: "flex", color: "#fb923c", fontSize: 34, fontWeight: 800 }}>
              Higher / Lower predictions
            </div>
          </div>

          <div
            style={{
              width: 360,
              height: 190,
              display: "flex",
              alignItems: "flex-end",
              gap: 14,
              padding: "24px",
              borderRadius: 24,
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.14)",
            }}
          >
            <div style={{ width: 30, height: 55, background: "#fb923c", borderRadius: 8 }} />
            <div style={{ width: 30, height: 95, background: "#f97316", borderRadius: 8 }} />
            <div style={{ width: 30, height: 78, background: "#fb923c", borderRadius: 8 }} />
            <div style={{ width: 30, height: 130, background: "#fdba74", borderRadius: 8 }} />
            <div style={{ width: 30, height: 155, background: "#fb923c", borderRadius: 8 }} />
            <div style={{ width: 30, height: 175, background: "#f97316", borderRadius: 8 }} />
          </div>
        </div>
      </div>
    ),
    size
  );
}
