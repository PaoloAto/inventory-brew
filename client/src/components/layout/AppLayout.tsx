import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import {
  AppBar,
  Avatar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined'
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined'
import MenuRoundedIcon from '@mui/icons-material/MenuRounded'
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined'
import RestaurantMenuOutlinedIcon from '@mui/icons-material/RestaurantMenuOutlined'
import SoupKitchenOutlinedIcon from '@mui/icons-material/SoupKitchenOutlined'
import { NavLink, useLocation } from 'react-router-dom'
import { ledgerTokens } from '../../theme'

const drawerWidth = 220

interface AppLayoutProps {
  children: ReactNode
}

const routeContext: Record<string, string> = {
  '/': 'Inventory overview',
  '/ingredients': 'Ingredient ledger',
  '/recipes': 'Recipe costing',
  '/transactions': 'Movement ledger',
  '/production': 'Production history',
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  const location = useLocation()
  const theme = useTheme()
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'))
  const [mobileOpen, setMobileOpen] = useState(false)

  const navItems = useMemo(
    () => [
      { label: 'Overview', icon: <DashboardOutlinedIcon />, to: '/' },
      { label: 'Ingredients', icon: <Inventory2OutlinedIcon />, to: '/ingredients' },
      { label: 'Recipes', icon: <RestaurantMenuOutlinedIcon />, to: '/recipes' },
      { label: 'Production', icon: <SoupKitchenOutlinedIcon />, to: '/production' },
      { label: 'Transactions', icon: <ReceiptLongOutlinedIcon />, to: '/transactions' },
    ],
    [],
  )

  const currentContext =
    Object.entries(routeContext).find(([path]) =>
      path === '/' ? location.pathname === path : location.pathname.startsWith(path),
    )?.[1] ?? 'Inventory Brew'

  const handleCloseMobileDrawer = () => {
    if (!isDesktop) setMobileOpen(false)
  }

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Toolbar
        sx={{
          minHeight: '60px !important',
          px: 2.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Box>
          <Typography
            sx={{
              fontFamily: '"IBM Plex Mono", monospace',
              fontSize: '0.8125rem',
              fontWeight: 500,
              letterSpacing: '0.075em',
            }}
          >
            INVENTORY BREW
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Restaurant stock ledger
          </Typography>
        </Box>
      </Toolbar>

      <List aria-label="Primary navigation" sx={{ px: 1.5, py: 2 }}>
        {navItems.map((item) => {
          const selected =
            item.to === '/'
              ? location.pathname === item.to
              : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)

          return (
            <ListItemButton
              key={item.to}
              component={NavLink}
              to={item.to}
              selected={selected}
              onClick={handleCloseMobileDrawer}
              sx={{
                minHeight: 40,
                mb: 0.5,
                py: 0.75,
                pl: 1.25,
                pr: 1,
                borderRadius: 0.5,
                borderLeft: '2px solid',
                borderLeftColor: selected ? 'primary.main' : 'transparent',
                color: selected ? 'text.primary' : 'text.secondary',
                '&.Mui-selected': {
                  bgcolor: ledgerTokens.hover,
                  '&:hover': { bgcolor: ledgerTokens.hover },
                },
                '&:hover': {
                  bgcolor: ledgerTokens.hover,
                  color: 'text.primary',
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 32, color: 'inherit', '& svg': { fontSize: 18 } }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                primaryTypographyProps={{ fontSize: 13, fontWeight: selected ? 500 : 400 }}
              />
            </ListItemButton>
          )
        })}
      </List>

    </Box>
  )

  const drawerPaperSx = {
    width: drawerWidth,
    boxSizing: 'border-box' as const,
    bgcolor: ledgerTokens.surfaceSecondary,
    borderRight: `1px solid ${ledgerTokens.border}`,
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        elevation={0}
        color="transparent"
        sx={{
          zIndex: (muiTheme) => muiTheme.zIndex.drawer + 1,
          ml: { md: `${drawerWidth}px` },
          width: { md: `calc(100% - ${drawerWidth}px)` },
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Toolbar
          sx={{
            justifyContent: 'space-between',
            px: { xs: 1.5, sm: 2.5 },
            minHeight: '60px !important',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {!isDesktop ? (
              <IconButton
                edge="start"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation"
              >
                <MenuRoundedIcon />
              </IconButton>
            ) : null}
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {currentContext}
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Avatar
              aria-label="Inventory Brew account"
              sx={{
                width: 30,
                height: 30,
                borderRadius: 1,
                bgcolor: 'primary.main',
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              IB
            </Avatar>
          </Box>
        </Toolbar>
      </AppBar>

      {isDesktop ? (
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            '& .MuiDrawer-paper': drawerPaperSx,
          }}
        >
          {drawerContent}
        </Drawer>
      ) : (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ '& .MuiDrawer-paper': drawerPaperSx }}
        >
          {drawerContent}
        </Drawer>
      )}

      <Box
        component="main"
        sx={{
          minWidth: 0,
          flexGrow: 1,
          px: { xs: 2, sm: 3, lg: 4 },
          pt: { xs: 3, md: 3.5 },
          pb: 4,
          mt: '60px',
          minHeight: '100vh',
        }}
      >
        <Box key={location.pathname} className="app-container route-content-enter">
          {children}
        </Box>
      </Box>
    </Box>
  )
}
