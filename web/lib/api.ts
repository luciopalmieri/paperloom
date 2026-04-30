export const backendUrl = (path: string): string => {
  const base =
    typeof window === "undefined"
      ? process.env.BACKEND_URL_INTERNAL ?? "http://localhost:8000"
      : process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
  return `${base}${path}`;
};
