import { Link, NavLink } from 'react-router-dom'
import './navbar.css'

export const Navbar = () => {
  return (
    <header className="navbar">
      <div className="navbar-left">
        <Link to="/" className="navbar-brand">
          Products Inventory
        </Link>
        <nav className="navbar-links">
          <NavLink to="/" className="navbar-link">
            About
          </NavLink>
          <div className="navbar-dropdown">
            <span className="navbar-link">Products ▾</span>
            <div className="navbar-dropdown-menu">
              <NavLink to="/ingredients" className="navbar-dropdown-item">
                Ingredients
              </NavLink>
              <NavLink to="/recipes" className="navbar-dropdown-item">
                Recipes
              </NavLink>
            </div>
          </div>
        </nav>
      </div>
      <div className="navbar-right">
        <span className="navbar-hello">Hello, Alpha</span>
        <button className="navbar-signout">Sign Out</button>
      </div>
    </header>
  )
}
