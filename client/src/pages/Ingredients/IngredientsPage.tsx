import { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Paper,
  Stack,
  TableContainer,
  TextField,
  Typography,
} from '@mui/material'
import type { Ingredient } from '../../types/ingredient'
import { IngredientTable } from '../../components/inventory/IngredientTable'

const MOCK_INGREDIENTS: Ingredient[] = [
  {
    id: '1',
    name: 'Product-1',
    manufacturer: 'ProdWip',
    unit: 'pcs',
    stockQuantity: 2,
    costPerUnit: 2000,
    isActive: true,
  },
  {
    id: '2',
    name: 'Product-2',
    manufacturer: 'ProdWip',
    unit: 'pcs',
    stockQuantity: 5,
    costPerUnit: 1500,
    isActive: true,
  },
  {
    id: '3',
    name: 'Product-3',
    manufacturer: 'ProdWip',
    unit: 'pcs',
    stockQuantity: 10,
    costPerUnit: 1000,
    isActive: true,
  },
]

export const IngredientsPage = () => {
  const [search, setSearch] = useState('')
  const [ingredients] = useState<Ingredient[]>(MOCK_INGREDIENTS)

  const filtered = useMemo(
    () =>
      ingredients.filter((ingredient) =>
        ingredient.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [ingredients, search],
  )

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        Ingredients
      </Typography>

      <Paper
        elevation={3}
        sx={{
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            px: 3,
            py: 2,
            background: 'linear-gradient(to right, #1A73E8, #42A5F5)',
            color: 'common.white',
          }}
        >
          <Typography variant="h6">Ingredients Inventory</Typography>
          <Typography variant="body2" sx={{ opacity: 0.9 }}>
            Track your restaurant stock levels and ingredient costs.
          </Typography>
        </Box>

        <Box sx={{ p: 3 }}>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            justifyContent="space-between"
            alignItems={{ xs: 'stretch', sm: 'center' }}
            mb={2}
          >
            <TextField
              size="small"
              label="Search ingredient"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              sx={{ maxWidth: 300 }}
            />
            <Button variant="contained">Add Ingredient</Button>
          </Stack>

          <TableContainer>
            <IngredientTable ingredients={filtered} />
          </TableContainer>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
            <Button variant="outlined" color="error">
              Delete selected
            </Button>
          </Box>
        </Box>
      </Paper>
    </Box>
  )
}
