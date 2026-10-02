/**
 * React Native's FormData accepts a file part described by its local URI
 * (`{ uri, type?, name? }`), which is how RN uploads files. The DOM lib's
 * FormData typings only know `string | Blob`, so this adds the RN overload
 * instead of casting at each call site.
 */
declare global {
  interface FormData {
    append(name: string, value: { uri: string; type?: string; name?: string }): void;
  }
}

export {};
