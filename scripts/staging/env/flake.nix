{
  description = "Ruby and Node for the wend staging service on logpi";

  # Pinned separately from anything on a developer's machine: this is the
  # toolchain the systemd services run with, and flake.lock is the record of
  # exactly which build. Unstable rather than a release channel because 24.11
  # and 25.05 top out well below the versions wend asks for.
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "aarch64-linux";   # Raspberry Pi 4/5 running 64-bit Pi OS
      pkgs = nixpkgs.legacyPackages.${system};
    in
    {
      # One directory of symlinks, published at /srv/wend/env, that the systemd
      # units put on PATH. `nix build --out-link` registers it as a GC root, so
      # a `nix-collect-garbage` won't take the running app's ruby away.
      packages.${system} = {
        default = self.packages.${system}.wend-env;
        wend-env = pkgs.buildEnv {
          name = "wend-env";
          paths = [
            pkgs.ruby_4_0      # backend/.ruby-version asks for 4.0.x
            pkgs.nodejs_24     # matches the node the frontend is developed on
          ];
        };
      };
    };
}
