import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import MenuRoundedIcon from '@mui/icons-material/MenuRounded'
import DashboardIcon from '@mui/icons-material/Dashboard'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded'
import { NavLink, useLocation } from 'react-router-dom'

const drawerWidth = 248

interface AppLayoutProps {
  children: ReactNode
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  const location = useLocation()
  const theme = useTheme()
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'))
  const [mobileOpen, setMobileOpen] = useState(false)

  const navItems = useMemo(
    () => [
      { label: 'Dashboard', icon: <DashboardIcon />, to: '/' },
      { label: 'Ingredients', icon: <Inventory2Icon />, to: '/ingredients' },
      { label: 'Recipes', icon: <RestaurantMenuIcon />, to: '/recipes' },
      { label: 'Transactions', icon: <ReceiptLongRoundedIcon />, to: '/transactions' },
    ],
    [],
  )

  const handleCloseMobileDrawer = () => {
    if (!isDesktop) setMobileOpen(false)
  }

  const drawerContent = (
    <>
      <Toolbar sx={{ minHeight: '72px !important', alignItems: 'center', px: 2 }}>
        <Box
          sx={{
            width: '100%',
            borderRadius: 2.5,
            px: 1.5,
            py: 1.25,
            background: 'linear-gradient(145deg, rgba(255,255,255,0.14), rgba(255,255,255,0.04))',
            border: '1px solid rgba(255,255,255,0.14)',
            backdropFilter: 'blur(6px)',
          }}
        >
          <Typography variant="subtitle2" sx={{ color: 'white', mb: 0.25 }}>
            Inventory Brew
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(231, 236, 247, 0.72)' }}>
            Restaurant Ops Console
          </Typography>
        </Box>
      </Toolbar>
      <List sx={{ mt: 1.5 }}>
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
              onClick={handleCloseMobileDrawer}
              sx={{
                mx: 1.25,
                mb: 0.75,
                borderRadius: 99,
                color: selected ? 'common.white' : '#c9d1df',
                background: selected ? 'linear-gradient(90deg, #2D7FF9, #57B0FF)' : 'transparent',
                '&.active': {
                  color: 'common.white',
                  background: 'linear-gradient(90deg, #2D7FF9, #57B0FF)',
                  '& .MuiListItemIcon-root': { color: 'inherit' },
                },
                '&:hover': {
                  bgcolor: selected ? undefined : 'rgba(255,255,255,0.08)',
                },
                transition: 'all 150ms ease',
                '&:active': { transform: 'scale(0.98)' },
              }}
            >
              <ListItemIcon sx={{ color: selected ? 'white' : '#8e99ab', minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 14, fontWeight: 500 }} />
            </ListItemButton>
          )
        })}
      </List>
    </>
  )

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        elevation={0}
        color="transparent"
        sx={{
          zIndex: (muiTheme) => muiTheme.zIndex.drawer + 1,
          borderBottom: '1px solid rgba(15, 23, 42, 0.09)',
          bgcolor: 'rgba(255,255,255,0.84)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 1.5, md: 2.5 }, minHeight: '72px !important' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            {!isDesktop && (
              <IconButton edge="start" color="primary" onClick={() => setMobileOpen(true)} aria-label="open navigation">
                <MenuRoundedIcon />
              </IconButton>
            )}
            <Typography variant="h6" noWrap sx={{ fontWeight: 800 }}>
              Operations Dashboard
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.4 }}>
            <Tooltip title="Notifications">
              <IconButton sx={{ color: 'text.secondary' }} aria-label="notifications">
                <Badge color="error" variant="dot">
                  <NotificationsRoundedIcon fontSize="small" />
                </Badge>
              </IconButton>
            </Tooltip>
            <Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'inline-flex' } }}>
              Hello, Chef
            </Typography>
            <Avatar sx={{ width: 34, height: 34, fontSize: 13, bgcolor: 'primary.main', boxShadow: '0 8px 20px rgba(45,127,249,0.35)' }}>
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
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
              borderRight: 'none',
              bgcolor: '#0E1524',
              color: '#fff',
              backgroundImage:
                'linear-gradient(180deg, #111C33 0%, #0A1427 54%, #07111F 100%)',
              boxShadow: '8px 0 34px rgba(7, 13, 24, 0.28)',
            },
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
          sx={{
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              boxSizing: 'border-box',
              borderRight: 'none',
              bgcolor: '#0E1524',
              color: '#fff',
              backgroundImage:
                'linear-gradient(180deg, #111C33 0%, #0A1427 54%, #07111F 100%)',
            },
          }}
        >
          {drawerContent}
        </Drawer>
      )}

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          px: { xs: 2, md: 3.5 },
          py: { xs: 2, md: 3 },
          mt: '74px',
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
