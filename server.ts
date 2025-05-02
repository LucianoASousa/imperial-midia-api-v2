class TimeTravelingHashmap<V> {
  // For each key, store a sorted map of timestamp -> value
  private storage: Map<string, Map<number, V>>;

  constructor() {
    this.storage = new Map();
  }

  put(key: string, timestamp: number, value: V): void {
    if (!this.storage.has(key)) {
      this.storage.set(key, new Map());
    }
    this.storage.get(key)!.set(timestamp, value);
  }

  get(key: string, timestamp: number): V | undefined {
    // If key doesn't exist, return undefined
    if (!this.storage.has(key)) {
      return undefined;
    }

    const timeMap = this.storage.get(key)!;

    // If the exact timestamp exists, return its value
    if (timeMap.has(timestamp)) {
      return timeMap.get(timestamp);
    }

    // Find the latest timestamp that's less than or equal to the requested timestamp
    const latestTimestamp = -Infinity;

    // Convert to array and sort to optimize search
    const timestamps = Array.from(timeMap.keys()).sort((a, b) => a - b);

    // Binary search to find the appropriate timestamp
    let left = 0;
    let right = timestamps.length - 1;
    let result = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      if (timestamps[mid] <= timestamp) {
        result = mid;
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    // If no valid timestamp was found
    if (result === -1) {
      return undefined;
    }

    return timeMap.get(timestamps[result]);
  }
}

// Example usage
const tth = new TimeTravelingHashmap<string>();
tth.put('foo', 1, 'car');
tth.put('foo', 6, 'jar');
console.log(tth.get('foo', 1)); // "car"
console.log(tth.get('foo', 6)); // "jar"
console.log(tth.get('foo', 3)); // "car" (latest value at or before timestamp 3)
console.log(tth.get('foo', 8)); // "jar" (latest value at or before timestamp 8)
