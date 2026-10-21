export function frames<Frame extends { $case: string }, Kind extends Frame["$case"]>(
  messages: readonly { message?: Frame }[],
  kind: Kind,
): Extract<Frame, { $case: Kind }>[] {
  return messages
    .map(({ message }) => message)
    .filter((message): message is Extract<Frame, { $case: Kind }> => message?.$case === kind);
}
