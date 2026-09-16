/** Every field of `T` optional, recursively — what a non-source dictionary is allowed to be. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};
