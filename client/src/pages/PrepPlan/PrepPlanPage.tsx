import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import {
  Alert,
  Box,
  Button,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { Link } from 'react-router-dom'
import { getErrorMessage } from '../../api/error'
import {
  getPrepPlan,
  previewPrepPlan,
  type PrepLookbackDays,
  type PrepPlanMeta,
  type PrepPreview,
  type PrepRecommendation,
} from '../../api/planning'
import { DataToolbar } from '../../components/ui/DataToolbar'
import { formatNumber, formatQuantity } from '../../components/ui/formatters'
import { LedgerEmptyState } from '../../components/ui/LedgerEmptyState'
import { LedgerPageHeader } from '../../components/ui/LedgerPageHeader'
import { LedgerSection } from '../../components/ui/LedgerSection'
import { MetricStrip } from '../../components/ui/MetricStrip'
import { StatusLabel } from '../../components/ui/StatusLabel'
import { TableSkeleton } from '../../components/ui/TableSkeleton'
import { useAppSnackbar } from '../../context/snackbarContext'
import { numericSx } from '../../theme'

const currency = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'TWD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const PrepPlanPage = () => {
  const { showSnackbar } = useAppSnackbar()
  const [lookbackDays, setLookbackDays] = useState<PrepLookbackDays>(14)
  const [search, setSearch] = useState('')
  const [meta, setMeta] = useState<PrepPlanMeta | null>(null)
  const [recommendations, setRecommendations] = useState<PrepRecommendation[]>([])
  const [planValues, setPlanValues] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<PrepPreview | null>(null)
  const [previewStale, setPreviewStale] = useState(false)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const loadRequestId = useRef(0)

  const loadPlan = useCallback(async () => {
    const requestId = loadRequestId.current + 1
    loadRequestId.current = requestId
    setLoading(true)
    setLoadError(null)
    setMeta(null)
    setRecommendations([])
    setPreview(null)
    setPreviewStale(false)
    setPlanError(null)
    try {
      const response = await getPrepPlan(formatLocalDate(new Date()), lookbackDays)
      if (requestId !== loadRequestId.current) return
      setMeta(response.meta)
      setRecommendations(response.recommendations)
      setPlanValues(
        Object.fromEntries(
          response.recommendations.map((item) => [item.recipeId, String(item.suggestedServings)]),
        ),
      )
      setPreview(response.preview)
    } catch (error) {
      if (requestId !== loadRequestId.current) return
      setLoadError(getErrorMessage(error, 'Prep recommendations could not be loaded.'))
    } finally {
      if (requestId === loadRequestId.current) setLoading(false)
    }
  }, [lookbackDays])

  useEffect(() => {
    void loadPlan()
  }, [loadPlan])

  const visibleRecommendations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return query
      ? recommendations.filter((item) => item.recipeName.toLocaleLowerCase().includes(query))
      : recommendations
  }, [recommendations, search])

  const handlePlanChange = (recipeId: string, value: string) => {
    if (!/^\d*$/.test(value)) return
    setPlanValues((current) => ({ ...current, [recipeId]: value }))
    setPlanError(null)
    setPreview(null)
    setPreviewStale(true)
  }

  const checkIngredients = async () => {
    const lines = recommendations.flatMap((item) => {
      const raw = planValues[item.recipeId] ?? ''
      const servings = Number(raw)
      return raw !== '' && Number.isSafeInteger(servings) && servings > 0
        ? [{ recipeId: item.recipeId, servings }]
        : []
    })
    const invalidValue = recommendations.some((item) => {
      const raw = planValues[item.recipeId] ?? ''
      if (raw === '' || raw === '0') return false
      const servings = Number(raw)
      return !Number.isSafeInteger(servings) || servings < 0
    })
    if (invalidValue) {
      setPlanError('Plan quantities must be whole servings.')
      return
    }
    if (lines.length === 0) {
      setPlanError('Enter a prep quantity for at least one menu item.')
      return
    }

    setChecking(true)
    setPlanError(null)
    try {
      setPreview(await previewPrepPlan(lines))
      setPreviewStale(false)
      showSnackbar('Ingredient needs checked.', { severity: 'success' })
    } catch (error) {
      setPreview(null)
      setPreviewStale(true)
      setPlanError(getErrorMessage(error, 'Ingredient needs could not be checked.'))
    } finally {
      setChecking(false)
    }
  }

  const hasCurrentPlan = preview !== null && preview.summary.recipeCount > 0

  return (
    <Box>
      <LedgerPageHeader
        title="Prep Plan"
        subtitle="Use recent recorded sales to estimate what to prepare and check ingredient needs."
        meta={
          meta ? (
            <Typography component="span" sx={{ ...numericSx, fontSize: 'inherit' }}>
              Sales history {meta.historyDateFrom} to {meta.historyDateTo}
            </Typography>
          ) : undefined
        }
      />

      <Stack spacing={3}>
        <DataToolbar
          primary={
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                  History
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={lookbackDays}
                  onChange={(_event, value: PrepLookbackDays | null) => value && setLookbackDays(value)}
                  aria-label="Sales history period"
                >
                  <ToggleButton value={7}>7 days</ToggleButton>
                  <ToggleButton value={14}>14 days</ToggleButton>
                  <ToggleButton value={30}>30 days</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <TextField
                size="small"
                label="Search menu items"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                sx={{ alignSelf: 'flex-end', minWidth: { xs: '100%', sm: 240 } }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />
            </Stack>
          }
          secondary={
            <Button variant="contained" onClick={() => void checkIngredients()} disabled={loading || checking}>
              {checking ? 'Checking…' : 'Check ingredients'}
            </Button>
          }
        />

        {loadError ? <Alert severity="error">{loadError}</Alert> : null}
        {meta && meta.recordedDayCount === 0 ? (
          <Alert severity="info">No recent sales data. You can still enter a prep quantity manually.</Alert>
        ) : meta && !meta.dataSufficient ? (
          <Alert severity="info">
            Early data — based on {meta.recordedDayCount} recorded sales day{meta.recordedDayCount === 1 ? '' : 's'}.
          </Alert>
        ) : null}
        {planError ? <Alert severity="error">{planError}</Alert> : null}
        {previewStale && !planError ? (
          <Alert severity="info">Plan changed — check ingredients to refresh stock needs.</Alert>
        ) : null}

        <LedgerSection
          title="Suggested prep"
          subtitle="Suggestions use complete recorded sales days. Adjust the Plan column as needed."
          padded={false}
        >
          {loading ? (
            <TableSkeleton rows={8} />
          ) : visibleRecommendations.length === 0 ? (
            <LedgerEmptyState
              title={recommendations.length === 0 ? 'No active menu items' : 'No matching menu items'}
              description={recommendations.length === 0 ? 'Add an active recipe to start a prep plan.' : 'Change your search to see more menu items.'}
            />
          ) : (
            <TableContainer sx={{ maxHeight: 520 }}>
              <Table size="small" stickyHeader aria-label="Prep recommendations">
                <TableHead>
                  <TableRow>
                    <TableCell>Menu item</TableCell>
                    <TableCell align="right">Avg sold / day</TableCell>
                    <TableCell align="right">Suggested</TableCell>
                    <TableCell align="right">Plan</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {visibleRecommendations.map((item) => (
                    <TableRow key={item.recipeId}>
                      <TableCell sx={{ fontWeight: 500 }}>{item.recipeName}</TableCell>
                      <TableCell align="right" sx={numericSx}>{formatNumber(item.averageDailySales, 1)}</TableCell>
                      <TableCell align="right" sx={numericSx}>{formatNumber(item.suggestedServings, 0)}</TableCell>
                      <TableCell align="right">
                        <TextField
                          size="small"
                          type="text"
                          inputMode="numeric"
                          value={planValues[item.recipeId] ?? ''}
                          onChange={(event) => handlePlanChange(item.recipeId, event.target.value)}
                          aria-label={`Planned servings for ${item.recipeName}`}
                          inputProps={{
                            min: 0,
                            step: 1,
                            style: { textAlign: 'right', fontSize: 16 },
                          }}
                          sx={{ width: 112 }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </LedgerSection>

        {hasCurrentPlan ? (
          <>
            <MetricStrip
              items={[
                { label: 'Planned servings', value: formatNumber(preview.summary.totalPlannedServings, 0) },
                { label: 'Menu items', value: formatNumber(preview.summary.recipeCount, 0) },
                { label: 'Ingredient shortages', value: formatNumber(preview.summary.shortageIngredientCount, 0) },
                { label: 'Estimated ingredient cost', value: currency.format(preview.summary.estimatedIngredientCost) },
              ]}
            />
            <Alert severity={preview.summary.canPrepare ? 'success' : 'warning'}>
              {preview.summary.canPrepare
                ? 'Current stock covers this prep plan.'
                : `${preview.summary.shortageIngredientCount} ingredient${preview.summary.shortageIngredientCount === 1 ? '' : 's'} need more stock.`}
            </Alert>
            <LedgerSection title="Ingredient needs" subtitle="Current stock compared with the whole prep plan." padded={false}>
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small" aria-label="Prep ingredient needs">
                  <TableHead>
                    <TableRow>
                      <TableCell>Ingredient</TableCell>
                      <TableCell align="right">Need</TableCell>
                      <TableCell align="right">On hand</TableCell>
                      <TableCell align="right">Short</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.ingredients.map((item) => (
                      <TableRow key={item.ingredientId}>
                        <TableCell sx={{ fontWeight: 500 }}>{item.ingredientName}</TableCell>
                        <TableCell align="right" sx={numericSx}>{formatQuantity(item.requiredQuantity, item.unit)}</TableCell>
                        <TableCell align="right" sx={numericSx}>{formatQuantity(item.availableQuantity, item.unit)}</TableCell>
                        <TableCell align="right" sx={numericSx}>{item.canSatisfy ? '—' : formatQuantity(item.shortfall, item.unit)}</TableCell>
                        <TableCell>
                          <StatusLabel
                            label={item.canSatisfy ? 'Ready' : 'Need more'}
                            tone={item.canSatisfy ? 'success' : 'warning'}
                          />
                        </TableCell>
                        <TableCell align="right">
                          {!item.canSatisfy ? (
                            <Button
                              component={Link}
                              to="/purchasing"
                              state={{
                                prefill: {
                                  ingredientId: item.ingredientId,
                                  quantity: item.shortfall,
                                  supplierId: item.preferredSupplier?.id,
                                },
                              }}
                              size="small"
                            >
                              Create PO
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </LedgerSection>
          </>
        ) : null}
      </Stack>
    </Box>
  )
}
