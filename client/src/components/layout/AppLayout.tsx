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
import MenuRoundedIcon from '@mui/icons-material/MenuRounded'
import DashboardIcon from '@mui/icons-material/Dashboard'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu'
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded'
import { NavLink, useLocation } from 'react-router-dom'
import './layout.css'

const drawerWidth = 232

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
      <Toolbar />
      <List sx={{ mt: 1.5 }}>
        {navItems.map((item) => {
          const selected = location.pathname === item.to
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
                background: selected ? 'linear-gradient(90deg, #1A73E8, #42A5F5)' : 'transparent',
                '&.active': {
                  color: 'common.white',
                  background: 'linear-gradient(90deg, #1A73E8, #42A5F5)',
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
          borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
          bgcolor: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(14px)',
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', px: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
            {!isDesktop && (
              <IconButton edge="start" color="primary" onClick={() => setMobileOpen(true)} aria-label="open navigation">
                <MenuRoundedIcon />
              </IconButton>
            )}
            <Typography variant="h6" noWrap sx={{ fontWeight: 700 }}>
              Inventory Brew
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Typography variant="body2" color="text.secondary">
              Hello, Chef
            </Typography>
            <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: 'primary.main' }}>IB</Avatar>
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
              bgcolor: '#10141f',
              color: '#fff',
              backgroundImage: 'linear-gradient(180deg, #10141f 0%, #060a12 100%)',
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
              bgcolor: '#10141f',
              color: '#fff',
              backgroundImage: 'linear-gradient(180deg, #10141f 0%, #060a12 100%)',
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
          p: { xs: 2, sm: 3 },
          mt: 9,
          minHeight: '100vh',
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
