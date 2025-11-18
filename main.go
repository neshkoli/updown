package main

import (
	"context"
	"embed"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Create application with menus
	AppMenu := menu.NewMenu()

	// Create custom app menu
	appSubMenu := menu.NewMenu()
	appSubMenu.AddText("About UpDown", nil, func(_ *menu.CallbackData) {
		app.ShowAbout()
	})
	appSubMenu.AddSeparator()
	appSubMenu.AddText("Quit UpDown", keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) {
		app.Quit()
	})
	appMenuItem := menu.SubMenu("UpDown", appSubMenu)
	AppMenu.Append(appMenuItem)

	// Create custom File menu
	fileSubMenu := menu.NewMenu()
	fileSubMenu.AddText("Open...", keys.CmdOrCtrl("o"), func(_ *menu.CallbackData) {
		app.LoadFile("")
	})
	fileSubMenu.AddSeparator()
	fileSubMenu.AddText("Export as PDF...", keys.CmdOrCtrl("e"), func(_ *menu.CallbackData) {
		app.ExportPDF()
	})
	fileMenuItem := menu.SubMenu("File", fileSubMenu)
	AppMenu.Append(fileMenuItem)

	AppMenu.Append(menu.EditMenu())
	AppMenu.Append(menu.WindowMenu())

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "UpDown",
		Width:  1200,
		Height: 800,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		Menu:             AppMenu,
		BackgroundColour: &options.RGBA{R: 255, G: 255, B: 255, A: 255},
		Bind:             []interface{}{app}, // Expose App to frontend so methods can be called
		OnStartup:        app.OnStartup,
		OnDomReady:       app.OnDomReady,
		OnBeforeClose: func(ctx context.Context) (prevent bool) {
			return false // Allow app to close
		},
		Frameless:                false,
		StartHidden:              false,
		HideWindowOnClose:        false,
		EnableDefaultContextMenu: true, // Enable dev tools for debugging
		DragAndDrop: &options.DragAndDrop{
			EnableFileDrop: true, // Enable Wails file drop functionality
		},
	})

	if err != nil {
		println("Error:", err.Error())
		os.Exit(1)
	}
}

func findIconPath() string {
	// Get the executable path
	execPath, err := os.Executable()
	if err != nil {
		return ""
	}
	execDir := filepath.Dir(execPath)

	// Look for UpDown.png in the same directory as the executable
	iconPath := filepath.Join(execDir, "UpDown.png")
	if _, err := os.Stat(iconPath); err == nil {
		return iconPath
	}

	// Also check current working directory
	cwd, err := os.Getwd()
	if err == nil {
		iconPath = filepath.Join(cwd, "UpDown.png")
		if _, err := os.Stat(iconPath); err == nil {
			return iconPath
		}
	}

	return ""
}
