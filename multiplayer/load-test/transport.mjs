// Ordered delivery impairment: loss models TCP retransmission stalls, never
// discards reliable game events. FIFO ordering remains WebSocket's contract.
export class ImpairedTransport {
  constructor({rtt = 0, jitter = 0, loss = 0, burst = false, random = Math.random} = {}) {
    Object.assign(this, {rtt, jitter, loss, burst, random});
    this.ends = {in: 0, out: 0}; this.timers = new Set();
    this.stats = {messages: 0, lossStalls: 0, burstStalls: 0}; this.started = Date.now();
  }
  schedule(direction, callback) {
    const now = Date.now();
    let delay = Math.max(0, this.rtt/2 + (this.random()*2-1)*this.jitter);
    if (this.random() < this.loss) { delay += 200; this.stats.lossStalls++; }
    if (this.burst && Math.floor((now-this.started)/1000)%30 === 20) { delay += 1000; this.stats.burstStalls++; }
    const due = this.ends[direction] = Math.max(now+delay, this.ends[direction]);
    this.stats.messages++;
    const timer = setTimeout(() => { this.timers.delete(timer); callback(); }, due-now);
    this.timers.add(timer);
  }
  close() { for (const timer of this.timers) clearTimeout(timer); this.timers.clear(); }
}
