import type { Ingredient } from '../../types/ingredient'
import { Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material'
import { IngredientRow } from './IngredientRow'

interface IngredientTableProps {
  ingredients: Ingredient[]
}

export const IngredientTable = ({ ingredients }: IngredientTableProps) => {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Ingredient</TableCell>
          <TableCell>Manufacturer</TableCell>
          <TableCell align="right">Cost / Unit</TableCell>
          <TableCell align="right">Stock</TableCell>
          <TableCell align="right">Total Value</TableCell>
          <TableCell>Status</TableCell>
          <TableCell align="center">Action</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {ingredients.map((ingredient) => (
          <IngredientRow key={ingredient.id} ingredient={ingredient} />
        ))}
      </TableBody>
    </Table>
  )
}
