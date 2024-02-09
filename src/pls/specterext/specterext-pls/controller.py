import logging
from flask import redirect, render_template, request, url_for, flash
from flask import current_app as app
from flask_login import login_required, current_user

from cryptoadvance.specter.specter import Specter
from cryptoadvance.specter.services.controller import user_secret_decrypted_required
from cryptoadvance.specter.user import User
from cryptoadvance.specter.wallet import Wallet
from cryptoadvance.specter.device import Device, Key
from .service import SpecterextPlsService

from embit import bip32, bip39, bech32
from embit.descriptor import Descriptor
from embit.ec import PublicKey
from embit.psbt import PSBT, DerivationPath
from binascii import hexlify

logger = logging.getLogger(__name__)

specterext_pls_endpoint = SpecterextPlsService.blueprint

def ext() -> SpecterextPlsService:
    ''' convenience for getting the extension-object'''
    return app.specter.ext["specterext-pls"]

def specter() -> Specter:
    ''' convenience for getting the specter-object'''
    return app.specter


@specterext_pls_endpoint.route("/")
@login_required
def index():
    return render_template(
        "specterext-pls/index.jinja",
    )



@specterext_pls_endpoint.route("/contracts")
@login_required
def contracts():
    # The wallet currently configured for ongoing autowithdrawals
    wallet: Wallet = SpecterextPlsService.get_associated_wallet()
    device: Device = SpecterextPlsService.get_associated_device()


    # 01 - get public key to make the multisig
    # addr = wallet.get_descriptor(0)
    # print('------')
    # print(addr)
    # print('------')

    # 02 - sign an external multisig transaction

    # 03 - create a nostr key from hd wallet
    keys_found = [key for key in (device.keys if device else []) if SpecterextPlsService.nostr_derivation_path == key.derivation]
    if len(keys_found) > 0:
        key_from_device = keys_found[0]
        xpub = bip32.HDKey.from_string(key_from_device.xpub)
        pub_key: PublicKey = xpub.derive([0, 0]).key
        npubhex = pub_key.xonly().hex()
        npub_bits = bech32.convertbits(bytearray.fromhex(npubhex), 8, 5)
        npub = bech32.bech32_encode(bech32.Encoding.BECH32, "npub", npub_bits)
    else:
        npubhex = ''
        npub = ''

    return render_template(
        "specterext-pls/contracts.jinja",
        wallet=wallet,
        device=device,
        npubhex=npubhex,
        npub=npub,
        services=app.specter.service_manager.services,
    )


@specterext_pls_endpoint.route("/settings", methods=["GET"])
@login_required
def settings_get():
    associated_wallet: Wallet = SpecterextPlsService.get_associated_wallet()
    associated_device: Device = SpecterextPlsService.get_associated_device()

    wallet_names = sorted(current_user.wallet_manager.wallets_names)
    wallets = [current_user.wallet_manager.wallets[name] for name in wallet_names]

    device_names = sorted(current_user.device_manager.devices_names)
    all_devices = [current_user.device_manager.devices[name] for name in device_names]
    devices = [device for device in all_devices if SpecterextPlsService.nostr_derivation_path in [key.derivation for key in device.keys]]

    return render_template(
        "specterext-pls/settings.jinja",
        associated_wallet=associated_wallet,
        associated_device=associated_device,
        wallets=wallets,
        devices=devices,
        cookies=request.cookies,
    )


@specterext_pls_endpoint.route("/settings", methods=["POST"])
@login_required
def settings_post():
    show_menu = request.form["show_menu"]
    user = app.specter.user_manager.get_user()
    if show_menu == "yes":
        user.add_service(SpecterextPlsService.id)
    else:
        user.remove_service(SpecterextPlsService.id)
    used_wallet_alias = request.form.get("used_wallet")
    if used_wallet_alias != None:
        wallet = current_user.wallet_manager.get_by_alias(used_wallet_alias)
        SpecterextPlsService.set_associated_wallet(wallet)
    used_device_alias = request.form.get("used_device")
    if used_device_alias != None:
        device = current_user.device_manager.get_by_alias(used_device_alias)
        SpecterextPlsService.set_associated_device(device)
    return redirect(url_for(f"{ SpecterextPlsService.get_blueprint_name()}.settings_get"))
