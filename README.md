# ide-powershell

This package provides rich [PowerShell](https://github.com/powershell/powershell)
language features in the [Atom](https://atom.io) editor via
[Atom IDE](https://ide.atom.io) and
[PowerShell Editor Services](https://github.com/PowerShell/PowerShellEditorServices)!

## Platform Support

- **Windows** with PowerShell v5.1 and PowerShell Core v6
- **Linux** with PowerShell Core v6 (all PowerShell-supported distributions)
- **macOS and OS X** with PowerShell Core v6

This package may work well with machines running PowerShell v3 and v4 but
they are not officially supported by this package at this time.

## Installation

You can easily install this package using the following command:

```
apm install ide-powershell
```

You can also find this package in Atom by running the command "Settings View: Install
Packages and Themes" and then search for and install `ide-powershell`

## Development

1. Fork this repo, clone it to a local folder, and go to that folder in a terminal

2. Run `apm install` install dependencies and build the package

3. Run `apm link` to wire up the package in Atom

4. Open or restart Atom and then try loading a .ps1 file

5. Change some code in this repo, run the "Reload Window" command, then try your changes!

# Contributing

We'd love to accept your contributions!  Please send a PR for small changes or
file and issue in advance to discuss if you have a bigger change in mind.

## Maintainers

- [David Wilson](https://github.com/daviwil) - [@daviwil](http://twitter.com/daviwil)
- [Patrick Meinecke](https://github.com/SeeminglyScience) - [@SeeminglyScienc](http://twitter.com/SeeminglyScienc)

## License

This project is licensed under the [MIT License](LICENSE).  Some portions of the
code are based on the [PowerShell extension](https://github.com/PowerShell/vscode-powershell/)
for Visual Studio Code, also under the [MIT License](https://github.com/PowerShell/vscode-powershell/blob/master/LICENSE.txt).
