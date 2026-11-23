import React,{createContext,useContext,useMemo,useState} from 'react';
import {createTheme,ThemeProvider} from '@mui/material/styles';
const C=createContext(null);
export function AppThemeProvider({children}){const [mode,setMode]=useState('light');const theme=useMemo(()=>createTheme({palette:{mode,primary:{main:'#3157d5'},background:{default:mode==='light'?'#f5f7fb':'#101522'}}}),[mode]);return <C.Provider value={{mode,toggle:()=>setMode(m=>m==='light'?'dark':'light')}}><ThemeProvider theme={theme}>{children}</ThemeProvider></C.Provider>}
export const useAppTheme=()=>useContext(C);
