import { useCallback, useState } from "react";
import { LogEntry } from "../types";

let _seq = 0;

export function useLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback(
    (level: LogEntry["level"], message: string) => {
      const entry: LogEntry = {
        id: String(++_seq),
        timestamp: new Date().toISOString(),
        level,
        message,
      };
      setLogs((prev) => [entry, ...prev].slice(0, 500));
    },
    []
  );

  const clearLogs = useCallback(() => setLogs([]), []);

  return { logs, addLog, clearLogs };
}
