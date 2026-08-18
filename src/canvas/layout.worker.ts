import { runLayout, type LayoutInput } from "./layout";

// Web Worker: runs the 3D force layout off the main thread.
//
// The previous renderer ran 60 warmup ticks synchronously before its first
// frame, which freezes the tab for as long as the layout takes -- and that
// scales with node count, so the largest graphs froze longest. Here the ticks
// run on a worker and intermediate positions stream back, so the graph is
// visible settling instead of the page being unresponsive.
//
// Protocol:
//   in : LayoutInput
//   out: { positions: Float32Array, tick: number, done: boolean }
//
// Positions are transferred rather than copied. `runLayout` already hands the
// callback a fresh copy per progress event, and the final buffer is not read
// again after posting, so neither transfer can detach a buffer still in use.

export interface LayoutProgress {
  positions: Float32Array;
  tick: number;
  done: boolean;
}

self.onmessage = (event: MessageEvent<LayoutInput>) => {
  const post = (message: LayoutProgress) => {
    (self as unknown as Worker).postMessage(message, [message.positions.buffer]);
  };

  const final = runLayout(event.data, (positions, tick) => {
    post({ positions, tick, done: false });
  });

  post({ positions: final, tick: event.data.ticks ?? 0, done: true });
};
