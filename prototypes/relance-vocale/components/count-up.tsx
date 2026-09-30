'use client'

import { useEffect, useRef, useState } from 'react'

/** A number that glides to its new value instead of jumping. */
export function CountUp({ value, format }: { value: number; format: (value: number) => string }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)

  useEffect(() => {
    const start = from.current
    if (start === value) return
    const began = performance.now()
    let frame = 0
    const step = (time: number) => {
      const t = Math.min(1, (time - began) / 700)
      const eased = 1 - (1 - t) ** 3
      setShown(start + (value - start) * eased)
      if (t < 1) frame = requestAnimationFrame(step)
      else from.current = value
    }
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      from.current = value
    }
  }, [value])

  return <>{format(shown)}</>
}
