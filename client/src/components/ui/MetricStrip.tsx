import { Box, Typography } from '@mui/material'
import { numericSx } from '../../theme'

export interface MetricStripItem {
  label: string
  value: string
  detail?: string
}

export const MetricStrip = ({ items }: { items: MetricStripItem[] }) => (
  <Box
    component="section"
    aria-label="Inventory metrics"
    sx={{
      display: 'grid',
      gridTemplateColumns: {
        xs: 'repeat(2, minmax(0, 1fr))',
        md: `repeat(${items.length}, minmax(0, 1fr))`,
      },
      borderBlock: '1px solid',
      borderColor: 'divider',
      bgcolor: 'background.paper',
    }}
  >
    {items.map((item, index) => (
      <Box
        key={item.label}
        sx={{
          minWidth: 0,
          px: { xs: 2, md: 2.5 },
          py: 2.25,
          borderLeft: {
            xs: index % 2 === 0 ? 0 : '1px solid',
            md: index === 0 ? 0 : '1px solid',
          },
          borderTop: {
            xs: index > 1 ? '1px solid' : 0,
            md: 0,
          },
          borderColor: 'divider',
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {item.label}
        </Typography>
        <Typography
          sx={{
            ...numericSx,
            mt: 0.6,
            fontSize: { xs: '1.35rem', sm: '1.65rem' },
            lineHeight: 1.1,
            fontWeight: 500,
            whiteSpace: 'nowrap',
          }}
        >
          {item.value}
        </Typography>
        {item.detail ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            {item.detail}
          </Typography>
        ) : null}
      </Box>
    ))}
  </Box>
)
