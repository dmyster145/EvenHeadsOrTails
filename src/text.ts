import { getTextWidth } from '@evenrealities/pretext'

export function centerText(text: string, innerWidth: number): string {
  const textW = getTextWidth(text)
  if (textW >= innerWidth) return text
  const spaceW = getTextWidth(' ')
  if (spaceW <= 0) return text
  const numSpaces = Math.round((innerWidth - textW) / 2 / spaceW)
  return ' '.repeat(numSpaces) + text
}
