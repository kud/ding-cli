import React from "react"
import { Box, Text } from "ink"

export const ACCENT = "#a3e635"

export type Hint = [key: string, label: string]

export type TabItem<T extends string> = {
  value: T
  label: string
  ready?: boolean
}

export const FooterHints = ({ hints }: { hints: Hint[] }) => (
  <Box gap={2} flexWrap="wrap">
    {hints.map(([key, label]) => (
      <Box key={key}>
        <Text color={ACCENT}>{key}</Text>
        <Text dimColor>{" " + label}</Text>
      </Box>
    ))}
  </Box>
)

export const Tabs = <T extends string>({
  active,
  items,
}: {
  active: T
  items: TabItem<T>[]
}) => (
  <Box gap={2}>
    {items.map((item) => {
      const isActive = item.value === active
      const marker = item.ready === false ? "○" : "•"

      return (
        <Box key={item.value} gap={0}>
          <Text
            bold={isActive}
            color={isActive ? ACCENT : undefined}
            dimColor={!isActive}
          >
            {item.label}
          </Text>
          <Text color={isActive ? ACCENT : undefined} dimColor={!isActive}>
            {" " + marker}
          </Text>
        </Box>
      )
    })}
  </Box>
)
