/**
 * @anya-ui/core — FileStorage Interface
 *
 * Abstract file storage contract. Implementations live in separate files.
 */

export interface FileStorage {
  read(path: string): Promise<string | null>;
  write(path: string, content: string): Promise<void>;
}
