# Exercise Repo Creator

Automates the process of creating an exercise repository in the DCI GitHub organisation

## Instructions

### Installation

```plaintext
npm install -g DCI-EdTech/exercise-repo-creator
```

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