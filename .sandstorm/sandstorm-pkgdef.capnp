@0xa3c5fdcef757d7ff;

using Spk = import "/sandstorm/package.capnp";
# This imports:
#   $SANDSTORM_HOME/latest/usr/include/sandstorm/package.capnp
# Check out that file to see the full, documented package definition format.

const pkgdef :Spk.PackageDefinition = (
  # The package definition. Note that the spk tool looks specifically for the
  # "pkgdef" constant.

  id = "fj5ehfkjgvnpfjgyptnacnrq6v3282af5kxr6uy4pszngadvgzf0",
  # Your app ID is actually its public key. The private key was placed in
  # your keyring. All updates must be signed with the same key.

  manifest = (

    appVersion = 3,  # Increment this for every release.
    appMarketingVersion = (defaultText = "2015.08.20"),

    appTitle = (defaultText = "BrowserQuest"),

    metadata = (
      icons = (
        appGrid = (png = (dpi1x = embed "app-graphics/browserquest-128.png",
                          dpi2x = embed "app-graphics/browserquest-256.png")),
        grain = (png = (dpi1x = embed "app-graphics/browserquest-24.png",
                        dpi2x = embed "app-graphics/browserquest-48.png")),
        market = (png = (dpi1x = embed "app-graphics/browserquest-150.png",
                         dpi2x = embed "app-graphics/browserquest-300.png")),
      ),
      website = "http://browserquest.mozilla.org",
      codeUrl = "https://github.com/dwrensha/BrowserQuest",
      license = (openSource = mpl2),
      categories = [games,],
      author = (
        upstreamAuthor = "Little Workshop",
        contactEmail = "david@sandstorm.io",
        pgpSignature = embed "pgp-signature",
      ),
      pgpKeyring = embed "pgp-keyring",
      description = (defaultText = embed "description.md"),
      screenshots = [(width = 448, height = 313, png = embed "screenshot.png")],
      changeLog = (defaultText = embed "changeLog.md"),
    ),


    actions = [
      # Define your "new document" handlers here.
      ( title = (defaultText = "New BrowserQuest Instance"),
        nounPhrase = (defaultText = "BrowserQuest Instance"),
        command = .myCommand
      )
    ],

    continueCommand = .myCommand
  ),

  sourceMap = (
    searchPath = [
      ( sourcePath = "." ),  # Search this directory first.
      ( sourcePath = "/opt/app"),
      ( sourcePath = "/",    # Then search the system root directory.
        hidePaths = [ "home", "proc", "sys", "etc/resolv.conf" ]
      )
    ]
  ),

  fileList = "sandstorm-files.list",

  alwaysInclude = ["client", "node_modules", "server"]
);

const myCommand :Spk.Manifest.Command = (
  # Here we define the command used to start up your server.
  argv = ["/sandstorm-http-bridge", "7097", "--", "sh", "start.sh"],
  environ = [
    # Note that this defines the *entire* environment seen by your app.
    (key = "PATH", value = "/usr/local/bin:/usr/bin:/bin")
  ]
);
