export function stackForWorker(workerIndex: number) {
  return {
    apiUrl: `http://localhost:${4001 + workerIndex}`,
    webUrl: `http://localhost:${4101 + workerIndex}`,
    dbName: `wind_e2e_w${workerIndex}`,
  };
}
