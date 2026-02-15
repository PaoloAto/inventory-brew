import type { ReactNode } from 'react'
import {
  AppBar,
  Avatar,
  Box,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material'
import DashboardIcon from '@mui/icons-material/Dashboard'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import RestaurantMenuIcon from '@mui/icons-material/RestaurantMenu'
import { NavLink, useLocation } from 'react-router-dom'
import './layout.css'

const drawerWidth = 232

interface AppLayoutProps {
  children: ReactNode
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  const location = useLocation()

  const navItems = [
    { label: 'Dashboard', icon: <DashboardIcon />, to: '/' },
    { label: 'Ingredients', icon: <Inventory2Icon />, to: '/ingredients' },
    { label: 'Recipes', icon: <RestaurantMenuIcon />, to: '/recipes' },
  ]

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar
        position="fixed"
        elevation={0}
        color="transparent"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
          bgcolor: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(14px)',
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', px: 2.5 }}>
          <Typography variant="h6" noWrap sx={{ fontWeight: 700 }}>
            Inventory Brew
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <Typography variant="body2" color="text.secondary">
              Hello, Chef
            </Typography>
            <Avatar sx={{ width: 32, height: 32, fontSize: 13, bgcolor: 'primary.main' }}>IB</Avatar>
          </Box>
        </Toolbar>
      </AppBar>

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
        <Toolbar />
        <List sx={{ mt: 1.5 }}>
          {navItems.map((item) => {
            const selected = location.pathname === item.to
            return (
              <ListItemButton
                key={item.to}
                component={NavLink}
                to={item.to}
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
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          mt: 9,
          ml: `${drawerWidth}px`,
          minHeight: '100vh',
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
