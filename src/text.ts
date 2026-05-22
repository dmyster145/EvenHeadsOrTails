import { getTextWidth } from '@evenrealities/pretext'

export function centerText(text: string, innerWidth: number): string {
  const textW = getTextWidth(text)
  if (textW >= innerWidth) return text
  const spaceW = getTextWidth(' ')
  if (spaceW <= 0) return text
  const numSpaces = Math.round((innerWidth - textW) / 2 / spaceW)
  return ' '.repeat(numSpaces) + text
}

export function spreadText(
  left: string,
  right: string,
  innerWidth: number,
): string {
  const spaceW = getTextWidth(' ')
  const used = getTextWidth(left) + getTextWidth(right)
  if (spaceW <= 0 || used >= innerWidth) return `${left} ${right}`
  // floor (not round) so the composed line never exceeds innerWidth — overshoot
  // would push the right text off the edge and clip its last glyph.
  const numSpaces = Math.max(1, Math.floor((innerWidth - used) / spaceW))
  return left + ' '.repeat(numSpaces) + right
}
