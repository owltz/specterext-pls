# PLS Specter Extension

This is the [Private Law Society - PLS](https://www.privatelawsociety.net) [Specter extension](https://docs.specter.solutions/desktop/extensions/intro/).

# Get it to run

Here is how to get it to run in your development environment:

```
pip3 install -e .
python3 -m cryptoadvance.specter server --config DevelopmentConfig --debug
# Point your browser to http://localhost:25441
# Click "Choose plugins" --> specterext-pls
```

If you want to package it, you can build it like this:

```
python3 -m pip install --upgrade build
python3 -m build
# install it like this:
pip3 install dist/pls_specterext-pls-0.0.1-py3-none-any.whl
```

If you want to bring your extension to production, please refer to the readme in the dummy-extension repo:
https://github.com/cryptoadvance/specterext-dummy#how-to-get-this-to-production
To publish your package

```
python3 -m pip install --upgrade twine
python3 -m twine upload --repository testpypi dist/*
```

You can get all these information again via:
python3 -m cryptoadvance.specter ext gen --help


# How to get this to production?
The above setup is describing a Development Environment for your extension. If you ommit the `--config DevelopmentConfig`, it'll no longer work. We don't want in a ProductionConfig, that arbitrary files get imported by python.
So in order to specify explicitely which extensions to load, there is a list in the [ProductionConfig](https://github.com/cryptoadvance/specter-desktop/blob/master/src/cryptoadvance/specter/config.py#L146-L150). So what you need to do is to first, switch the `devstatus` in your `DummyService`-class to production and then create your own relevant configuration and specify the extensions you want to load.
You could do that e.g. by creating a file in `./src/mynym/specterext/dummy/app_config.py` with this content:
There is already an example in the folder when you generate the extension.
```
from cryptoadvance.specter.config import ProductionConfig


class Config(ProductionConfig):
    EXTENSION_LIST=[
        "dummy.service"
    ]
```

Then you'd start specter like this:
```
python3 -m cryptoadvance.specter server --config dummy.appconfig.Config
```

It's also possible, that you publish your extension on PyPi and use a fully qualified module-name in the `EXTENSION_LIST`. Obviously, you would need to install that in your (virtual-) environment in that case.

# Get Help

If you want help or can't implement what you have in your mind or just want to say hello, join our Telegram-Chat.

https://t.me/+yS4VO2JqBHkzYTI6

If you want to
