export class SlidingWindowCounter {
  #count = 0;
  #timeouts = new Set<number>();

  constructor(
    public readonly period: number,
    public readonly nonnegative = true,
  ) {}

  public get count() {
    return this.#count;
  }

  public set count(count: number) {
    this.#clearAllTimeouts();
    this.#count = count;
  }

  public increment() {
    this.#count++;
    const newTimeout = setTimeout(() => {
      this.#count--;
      this.#timeouts.delete(newTimeout);
    }, this.period);

    this.#timeouts.add(newTimeout);
  }

  public decrement() {
    if (this.#count <= 0 && this.nonnegative) return;

    this.#count--;

    const mostRecentTimeout = [...this.#timeouts].pop();
    if (mostRecentTimeout) {
      clearTimeout(mostRecentTimeout);
      this.#timeouts.delete(mostRecentTimeout);
    }
  }

  public dispose() {
    this.#clearAllTimeouts();
  }

  #clearAllTimeouts() {
    for (const timeoutId of this.#timeouts) {
      clearTimeout(timeoutId);
    }
    this.#timeouts.clear();
  }
}
