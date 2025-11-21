import type { ReactNode } from 'react'
import {
  AppBar,
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

const drawerWidth = 220

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
        color="default"
        sx={{
          zIndex: (theme) => theme.zIndex.drawer + 1,
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between' }}>
          <Typography variant="h6" noWrap>
            Inventory Brew
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Hello, Chef
          </Typography>
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
            bgcolor: '#1f1f2d',
            color: '#fff',
            backgroundImage: 'linear-gradient(180deg, #1f1f2d 0%, #101018 100%)',
          },
        }}
      >
        <Toolbar />
        <List sx={{ mt: 1 }}>
          {navItems.map((item) => {
            const selected = location.pathname === item.to
            return (
              <ListItemButton
                key={item.to}
                component={NavLink}
                to={item.to}
                selected={selected}
                sx={{
                  mx: 1,
                  borderRadius: 2,
                  color: '#fff',
                  '&.Mui-selected': {
                    bgcolor: 'primary.main',
                    color: 'primary.contrastText',
                    '& .MuiListItemIcon-root': { color: 'inherit' },
                  },
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.08)',
                  },
                }}
              >
                <ListItemIcon sx={{ color: '#cfd4dc', minWidth: 36 }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
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
          mt: 8,
          ml: `${drawerWidth}px`,
          minHeight: '100vh',
        }}
      >
        {children}
      </Box>
    </Box>
  )
}
