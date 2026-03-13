import ora, { type Ora } from "ora";

export function createSpinner(text: string): Ora {
  return ora({ text, spinner: "dots" });
}

export async function withSpinner<T>(
  text: string,
  fn: (spinner: Ora) => Promise<T>,
): Promise<T> {
  const spinner = createSpinner(text).start();
  try {
    const result = await fn(spinner);
    spinner.succeed();
    return result;
  } catch (err) {
    spinner.fail();
    throw err;
  }
}
