export type DraftValue = { document: object; reason: string };
export class DraftSession {
  input: DraftValue;
  revision: number;
  dirty = false;
  status: "saved" | "dirty" | "saving" | "error" = "saved";
  error = "";
  recoveryError = "";
  private generation = 0;
  private inflight: Promise<boolean> | null = null;
  private discarding = false;
  async discard(remove: (revision: number) => Promise<void>): Promise<boolean> {
    this.discarding = true;
    try {
      if (this.inflight) await this.inflight;
      await remove(this.revision);
      this.dirty = false;
      this.status = "saved";
      this.error = "";
      this.stash(null);
      return true;
    } catch (e) {
      this.error = String(e);
      this.status = "error";
      this.stash({ input: this.input, revision: this.revision });
      return false;
    } finally {
      this.discarding = false;
      this.changed();
    }
  }
  constructor(
    input: DraftValue,
    revision: number,
    private save: (input: DraftValue, revision: number) => Promise<number>,
    private recover: (
      value: { input: DraftValue; revision: number } | null,
    ) => void,
    private changed: () => void = () => {},
  ) {
    this.input = structuredClone(input);
    this.revision = revision;
  }
  private stash(value: { input: DraftValue; revision: number } | null) {
    try {
      this.recover(value);
      this.recoveryError = "";
    } catch (e) {
      this.recoveryError = String(e);
    }
  }
  edit(input: DraftValue) {
    this.input = structuredClone(input);
    this.generation++;
    this.dirty = true;
    this.status = "dirty";
    this.stash({ input: this.input, revision: this.revision });
    this.changed();
  }
  flush(): Promise<boolean> {
    if (this.inflight) return this.inflight;
    this.inflight = this.run().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }
  private async run() {
    while (this.dirty && !this.discarding) {
      const generation = this.generation;
      const input = structuredClone(this.input);
      this.status = "saving";
      this.changed();
      try {
        this.revision = await this.save(input, this.revision);
        this.error = "";
        if (generation === this.generation) {
          this.dirty = false;
          this.status = "saved";
          this.stash(null);
        } else {
          this.stash({ input: this.input, revision: this.revision });
        }
      } catch (e) {
        this.status = "error";
        this.error = String(e);
        this.stash({ input: this.input, revision: this.revision });
        this.changed();
        return false;
      }
      this.changed();
    }
    return true;
  }
}
