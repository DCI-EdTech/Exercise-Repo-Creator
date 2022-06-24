# Exercise Repo Creator

Automates the process of creating an exercise repository in the DCI GitHub organisation

## Instructions

### Installation

```plaintext
npm install -g DCI-EdTech/exercise-repo-creator
```

### GitHub Personal Access Token

In order to use this script you need a GitHub Personal Access Token.
  
To obtain one, refer to the [this guide](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token 
) from the official documentation.

Once you've created a token, you should save it in an environment variable.

If you are using the bash or zsh shells, just run this command:

```plaintext
export GITHUB_PAT=123abc
```

Replace `123abc` with the correct GitHub token.

This command will store the token only for a single terminal session. If you want to store it permanently you have to add the `export` command above to one of the files below:

- **bash**: add it to either `~/.bash_profile`, `~/.bash_login`, `~/.profile` 
- **zsh**: `~/.zprofile` 

If you use a different shell, refer to this [Unix StackExchange](https://unix.stackexchange.com/a/117470) answer.

### Usage

After installing the package globally you should be able to run the script from anywhere in your system.

The command to run is:

```
exercise-repo-creator <organization name>
```

The script expects to be executed from within an `exercise folder`.

The structure for an `exercise folder` is the following:

```plaintext
PB-language-variables/
    main/
        task-1.js
        task-2.js
        task-3.js
    solution/
        task-1.js
        task-2.js
        task-3.js
    README.md
```

The exercise folder needs to be named as the repository you want to create and it should follow DCI's conventions, specifically:

- start with the acronym for a module: BDL, UIB, PB, SPA, BE
- follow that with the submodule name
- and than the name of the exercise itself
- all separated by dashes

Inside the folder there must be 2 other folders and a README.md file:

- `main`: could be empty, or it can contain any file necessary to work on the exercise. The content of this folder will be pushed to the `main` branch
- `solution`: should contain files with the exercise solution. The content of this folder will be pushed to the `solution` branch